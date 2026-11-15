package com.example.backend.service;

import com.example.backend.auth.AppleRevocation;
import com.example.backend.auth.AppleTokenVerifier;
import com.example.backend.auth.CurrentUser;
import com.example.backend.billing.SubscriptionService;
import com.example.backend.common.ApiException;
import com.example.backend.common.Domain;
import com.example.backend.domain.Appointment;
import com.example.backend.domain.Student;
import com.example.backend.domain.UserAccount;
import com.example.backend.mail.MailService;
import com.example.backend.service.StudentService.EmailOwner;
import com.example.backend.store.Db;
import com.google.cloud.firestore.BulkWriter;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Someone deletes their own account. What happens to the people around them depends on who they are:
 * a student's record stays with the studio without anything personal (packages and revenue still add
 * up); a teacher's students go to the owner; an owner deletes the whole studio, students' sign-ins
 * included. A studio with other teachers must remove them first.
 * Billing orders are kept: they are the accounting record of what was paid.
 */
@Service
public class AccountService {

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);

    private final Db db;
    private final StudentService students;
    private final SubscriptionService subscriptions;
    private final MailService mail;
    private final AppleTokenVerifier apple;
    private final AppleRevocation appleRevocation;

    public AccountService(Db db, StudentService students, SubscriptionService subscriptions, MailService mail, AppleTokenVerifier apple, AppleRevocation appleRevocation) {
        this.db = db;
        this.students = students;
        this.subscriptions = subscriptions;
        this.mail = mail;
        this.apple = apple;
        this.appleRevocation = appleRevocation;
    }

    /** Whether the app should ask Apple for an authorization code before deleting this account. */
    public boolean needsAppleRevocation(CurrentUser user) {
        return appleRevocation.enabled() && account(user).appleSub != null;
    }

    /**
     * Revokes the account's Sign in with Apple. Only with a token for this very Apple account. If Apple
     * can't be reached the deletion still goes ahead: nobody should be stuck with an account they want gone.
     */
    public void revokeApple(CurrentUser user, String identityToken, String authorizationCode) {
        UserAccount me = account(user);
        if (me.appleSub == null || !me.appleSub.equals(apple.verify(identityToken).sub())) {
            throw ApiException.forbidden("請使用這個帳號綁定的 Apple ID 驗證");
        }
        try {
            appleRevocation.revoke(authorizationCode);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Revoking Sign in with Apple for {} was interrupted", me.id);
        } catch (Exception e) {
            log.error("Could not revoke Sign in with Apple for {}", me.id, e);
        }
    }

    private UserAccount account(CurrentUser user) {
        return db.get(db.doc(Db.USERS, user.userId()), UserAccount.class).orElseThrow(() -> ApiException.unauthorized("帳號不存在"));
    }

    public void delete(CurrentUser user) {
        UserAccount me = account(user);
        if (user.isOwner()) requireNoOtherCoaches(me);
        if (user.isStudent()) {
            anonymizeStudent(me);
        } else if (user.isStudioCoach()) {
            handStudentsToOwner(user, me);
        }
        // An owner's studio (nobody else has a workspace of their own).
        deleteWorkspace(me.id);
        deleteIdentity(me);
    }

    private void requireNoOtherCoaches(UserAccount owner) {
        List<UserAccount> coaches = db.list(db.fs.collection(Db.USERS).whereEqualTo("coachId", owner.id), UserAccount.class).stream()
                .filter(u -> !u.id.equals(owner.id) && Domain.COACH.equals(u.role))
                .toList();
        if (coaches.stream().anyMatch(UserAccount::hasLogin)) {
            throw ApiException.conflict("studio_has_coaches", "工作室還有其他老師，請先將他們移出工作室，再刪除帳號。");
        }
        // Invited, never signed in: nothing of theirs to keep.
        for (UserAccount invited : coaches) deleteIdentity(invited);
    }

    /** The record stays in the coach's workspace with nothing personal; what they logged themselves goes. */
    private void anonymizeStudent(UserAccount me) {
        String space = me.coachId;
        var ref = db.coachDoc(space, Db.STUDENTS, me.id);
        Student s = db.get(ref, Student.class).orElse(null);
        if (s == null) return;
        Instant now = Instant.now();
        BulkWriter w = db.fs.bulkWriter();
        for (String col : List.of(Db.GOALS, Db.METRICS)) {
            for (QueryDocumentSnapshot d : Db.await(db.coachCol(space, col).whereEqualTo("studentId", me.id).get()).getDocuments()) w.delete(d.getReference());
        }
        for (QueryDocumentSnapshot d : Db.await(db.coachCol(space, Db.WORKOUTS).whereEqualTo("studentId", me.id).whereEqualTo("createdBy", Domain.STUDENT).get()).getDocuments()) {
            w.delete(d.getReference());
        }
        for (Appointment a : db.list(db.coachCol(space, Db.APPOINTMENTS).whereEqualTo("studentId", me.id), Appointment.class)) {
            if ("scheduled".equals(a.status) && a.startAt.isAfter(now)) w.update(db.coachDoc(space, Db.APPOINTMENTS, a.id), "status", "cancelled");
        }
        if (s.inviteCode != null) w.delete(db.doc(Db.INVITES, s.inviteCode));
        s.name = "已刪除帳號的學員";
        s.email = "";
        s.phone = null;
        s.gender = "other";
        s.birthYear = null;
        s.heightCm = null;
        s.goalDetail = "";
        s.coachNotes = "";
        s.status = "inactive";
        s.activated = false;
        s.inviteCode = null;
        s.leftAt = now;
        w.set(ref, db.encode(s));
        Db.finish(w);
    }

    private void handStudentsToOwner(CurrentUser user, UserAccount me) {
        String space = user.coachId();
        List<Student> theirs = db.list(db.coachCol(space, Db.STUDENTS), Student.class).stream().filter(s -> me.id.equals(s.coach())).toList();
        for (Student s : theirs) db.update(db.coachDoc(space, Db.STUDENTS, s.id), "assignedCoachId", null);
        UserAccount owner = db.get(db.doc(Db.USERS, space), UserAccount.class).orElse(null);
        if (owner != null && owner.email != null) {
            String text = me.name + " 已刪除帳號並離開工作室。" + (theirs.isEmpty() ? "" : "他帶的 " + theirs.size() + " 位學員已轉給你，上課紀錄與堂數都保留，可以在工作室頁面重新分配給其他老師。") + "\n\nPila More More";
            mail.send(owner.email, me.name + " 已離開工作室", text, "<p>" + text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n\n", "</p><p>") + "</p>");
        }
    }

    /** The card stops being charged and everything goes, students' sign-ins included. */
    private void deleteWorkspace(String spaceId) {
        if (db.get(db.doc(Db.COACHES, spaceId), com.example.backend.domain.Coach.class).isEmpty()) return;
        subscriptions.stopCharging(spaceId);
        CurrentUser asOwner = new CurrentUser(spaceId, Domain.COACH, spaceId);
        for (Student s : db.list(db.coachCol(spaceId, Db.STUDENTS), Student.class)) {
            if (!s.id.equals(spaceId)) students.delete(asOwner, s.id, true);
        }
        List<String> collections = new ArrayList<>(Db.COACH_SUBCOLLECTIONS);
        collections.add(Db.EXERCISES);
        BulkWriter w = db.fs.bulkWriter();
        for (String col : collections) {
            for (QueryDocumentSnapshot d : Db.await(db.coachCol(spaceId, col).get()).getDocuments()) w.delete(d.getReference());
        }
        w.delete(db.doc(Db.COACHES, spaceId));
        Db.finish(w);
    }

    /** The sign-in itself, and everything tied to it. */
    private void deleteIdentity(UserAccount u) {
        BulkWriter w = db.fs.bulkWriter();
        for (String col : List.of(Db.PUSH_SUBSCRIPTIONS, Db.PASSWORD_RESETS, Db.EMAIL_VERIFICATIONS)) {
            for (QueryDocumentSnapshot d : Db.await(db.fs.collection(col).whereEqualTo("userId", u.id).get()).getDocuments()) w.delete(d.getReference());
        }
        if (u.inviteCode != null) w.delete(db.doc(Db.INVITES, u.inviteCode));
        if (u.email != null) {
            var emailRef = db.doc(Db.EMAILS, StudentService.key(u.email));
            EmailOwner owner = db.get(emailRef, EmailOwner.class).orElse(null);
            if (owner != null && u.id.equals(owner.userId)) w.delete(emailRef);
        }
        w.delete(db.doc(Db.USERS, u.id));
        Db.finish(w);
    }
}
