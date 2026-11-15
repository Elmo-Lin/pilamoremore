package com.example.backend.service;

import com.example.backend.auth.CurrentUser;
import com.example.backend.billing.Plans;
import com.example.backend.billing.SubscriptionService;
import com.example.backend.common.ApiException;
import com.example.backend.common.Domain;
import com.example.backend.common.Ids;
import com.example.backend.domain.Coach;
import com.example.backend.domain.Invite;
import com.example.backend.domain.Student;
import com.example.backend.domain.UserAccount;
import com.example.backend.mail.MailService;
import com.example.backend.service.StudentService.EmailOwner;
import com.example.backend.store.Db;
import com.example.backend.web.Dtos.CoachDto;
import com.example.backend.web.Dtos.CoachInviteDto;
import com.example.backend.web.Dtos.CoachMemberDto;
import com.example.backend.web.Dtos.InviteCoachInput;
import com.example.backend.web.Dtos.PackagePresetDto;
import com.example.backend.web.Dtos.StudioDto;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Studios: the owner invites teachers (up to the studio's seats, owner included), moves students
 * between them and can deactivate a teacher. Students belong to the studio, so they stay (with their
 * history) when a teacher leaves.
 */
@Service
public class StudioService {

    static final Duration INVITE_TTL = Duration.ofDays(14);

    private final Db db;
    private final AccessService access;
    private final SubscriptionService subscriptions;
    private final MailService mail;

    public StudioService(Db db, AccessService access, SubscriptionService subscriptions, MailService mail) {
        this.db = db;
        this.access = access;
        this.subscriptions = subscriptions;
        this.mail = mail;
    }

    // ----------------------------------------------------------------------------- reads

    /** Coaches of a workspace (owner first). */
    public List<UserAccount> members(String spaceId) {
        return db.list(db.fs.collection(Db.USERS).whereEqualTo("coachId", spaceId), UserAccount.class).stream()
                .filter(u -> Domain.COACH.equals(u.role) || Domain.OWNER.equals(u.role))
                .sorted(Comparator.comparing((UserAccount u) -> !u.id.equals(spaceId)).thenComparing(u -> u.createdAt))
                .toList();
    }

    /** The workspace as coaches see it; invite codes only for the owner. Null for students. */
    public StudioDto studio(CurrentUser user, Coach space) {
        if (!user.isCoach()) return null;
        List<CoachMemberDto> coaches = members(space.id).stream().map(u -> member(u, user.isOwner())).toList();
        Plans.Access plan = Plans.access(space, Instant.now());
        // Nobody joins with an account of their own (Lift More More's free coaches did): nothing is ever pending.
        return new StudioDto(space.id, Domain.SPACE_STUDIO, space.studio, space.id, plan.coachLimit(), coaches);
    }

    /**
     * "The coach" profile: a coach's own (their title, the workspace's studio name), or a
     * student's responsible teacher without contact details.
     */
    public CoachDto profile(Coach space, String coachId, boolean includeContact) {
        UserAccount u = db.get(db.doc(Db.USERS, coachId), UserAccount.class).orElse(null);
        if (u == null) return Mapper.coach(space, includeContact);
        String title = u.title != null ? u.title : u.id.equals(space.id) ? space.title : "老師";
        List<PackagePresetDto> presets = includeContact && u.packagePresets != null
                ? u.packagePresets.stream().map(p -> new PackagePresetDto(p.name, p.totalSessions, p.priceTwd)).toList()
                : null;
        return new CoachDto(u.id, Domain.COACH, u.name, includeContact ? u.email : "", includeContact ? u.phone : null, title, space.studio, u.createdAt, presets);
    }

    // ----------------------------------------------------------------------------- owner actions

    /** Creates the coach's account (no password yet) and a one-time code they activate it with. */
    public CoachInviteDto inviteCoach(CurrentUser user, InviteCoachInput in) {
        user.requireOwner();
        String spaceId = user.coachId();
        subscriptions.requireCoachSeat(spaceId, members(spaceId).stream().filter(u -> !Boolean.FALSE.equals(u.active)).count());

        String email = in.email().trim();
        UserAccount coach = new UserAccount();
        coach.id = Ids.newId("coach");
        coach.role = Domain.COACH;
        coach.coachId = spaceId;
        coach.name = in.name().trim();
        coach.email = email;
        coach.title = in.title() == null || in.title().isBlank() ? "老師" : in.title().trim();
        coach.createdAt = Instant.now();
        db.transaction(tx -> {
            var emailRef = db.doc(Db.EMAILS, StudentService.key(email));
            if (tx.get(emailRef, EmailOwner.class).isPresent()) throw ApiException.conflict("email_taken", "此 Email 已被其他帳號使用");
            tx.create(emailRef, new EmailOwner(coach.id));
            tx.create(db.doc(Db.USERS, coach.id), coach);
            return null;
        });
        Invite invite = issueInvite(spaceId, coach);
        return new CoachInviteDto(member(coach, true), invite.code, invite.expiresAt, null);
    }

    /** New code for a coach who has not activated yet (the old one stops working). */
    public CoachInviteDto reinvite(CurrentUser user, String coachId) {
        UserAccount coach = memberOf(user.requireOwner(), coachId);
        if (coach.hasLogin()) throw ApiException.conflict("already_active", "此老師已啟用帳號");
        Invite invite = issueInvite(user.coachId(), coach);
        return new CoachInviteDto(member(coach, true), invite.code, invite.expiresAt, null);
    }

    /**
     * The owner removes a teacher from the studio. Their students move to {@code transferTo} first
     * (required when they have any). A teacher who already activated is deactivated: they can no longer
     * sign in (their token stops working at once), their seat is freed and they are emailed; what they
     * logged stays with the studio. One who never activated is deleted, freeing their email too.
     */
    public void deactivate(CurrentUser user, String coachId, String transferTo) {
        UserAccount coach = memberOf(user.requireOwner(), coachId);
        if (!Domain.COACH.equals(coach.role)) throw ApiException.badRequest("無法移除經營者");
        List<Student> theirs = db.list(db.coachCol(user.coachId(), Db.STUDENTS), Student.class).stream()
                .filter(s -> coachId.equals(s.coach()))
                .toList();
        if (!theirs.isEmpty()) {
            if (transferTo == null || transferTo.equals(coachId)) throw ApiException.badRequest("請選擇接手學員的老師");
            String target = activeCoach(user, transferTo).id;
            for (Student s : theirs) db.update(db.coachDoc(user.coachId(), Db.STUDENTS, s.id), "assignedCoachId", assignedValue(user, target));
        }
        if (coach.inviteCode != null) db.delete(db.doc(Db.INVITES, coach.inviteCode));
        if (!coach.hasLogin()) {
            db.delete(db.doc(Db.EMAILS, StudentService.key(coach.email)));
            db.delete(db.doc(Db.USERS, coach.id));
            return;
        }
        Coach studio = db.get(db.doc(Db.COACHES, user.coachId()), Coach.class).orElseThrow(() -> ApiException.notFound("找不到工作室"));
        db.update(db.doc(Db.USERS, coach.id), "active", false);
        String text = "你已被移出「" + studioName(studio) + "」，這個帳號無法再登入。"
                + "\n\n原本帶的學員留在工作室，上課紀錄與堂數由工作室保留。\n\nPila More More";
        mail.send(coach.email, "你已被移出工作室", text, html(text));
    }

    /** Hands a student (with all their history) to another active coach of the studio. */
    public void transferStudent(CurrentUser user, String studentId, String coachId) {
        Student s = access.student(user.requireOwner(), studentId);
        String target = activeCoach(user, coachId).id;
        db.update(db.coachDoc(user.coachId(), Db.STUDENTS, s.id), "assignedCoachId", assignedValue(user, target));
    }

    // ----------------------------------------------------------------------------- helpers

    private static String studioName(Coach studio) {
        return studio.studio == null || studio.studio.isBlank() ? "工作室" : studio.studio;
    }

    /** Plain text (paragraphs split by a blank line) as escaped HTML. */
    private static String html(String text) {
        return "<p>" + text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n\n", "</p><p>") + "</p>";
    }

    private UserAccount memberOf(CurrentUser user, String coachId) {
        UserAccount u = db.get(db.doc(Db.USERS, coachId), UserAccount.class).orElseThrow(() -> ApiException.notFound("找不到此老師"));
        if (!user.coachId().equals(u.coachId) || !(Domain.COACH.equals(u.role) || Domain.OWNER.equals(u.role))) throw ApiException.notFound("找不到此老師");
        return u;
    }

    /** A coach who can take students: the owner, or a studio coach who activated and is not deactivated. */
    private UserAccount activeCoach(CurrentUser user, String coachId) {
        UserAccount u = memberOf(user, coachId);
        if (!u.hasLogin() || Boolean.FALSE.equals(u.active)) throw ApiException.badRequest("此老師尚未啟用或已停用");
        return u;
    }

    /** The owner is the default (stored as no value). */
    private static String assignedValue(CurrentUser user, String coachId) {
        return coachId.equals(user.coachId()) ? null : coachId;
    }

    private Invite issueInvite(String spaceId, UserAccount coach) {
        Invite invite = new Invite();
        invite.kind = "coach";
        invite.studentId = coach.id;
        invite.coachId = spaceId;
        invite.expiresAt = Instant.now().plus(INVITE_TTL);
        for (int attempt = 0; ; attempt++) {
            invite.code = Ids.inviteCode();
            try {
                db.create(db.doc(Db.INVITES, invite.code), invite);
                break;
            } catch (ApiException e) {
                if (!"id_taken".equals(e.code()) || attempt > 5) throw e;
            }
        }
        if (coach.inviteCode != null) db.delete(db.doc(Db.INVITES, coach.inviteCode));
        coach.inviteCode = invite.code;
        db.update(db.doc(Db.USERS, coach.id), "inviteCode", invite.code);
        return invite;
    }

    private static CoachMemberDto member(UserAccount u, boolean withInvite) {
        String status = Boolean.FALSE.equals(u.active) ? "inactive" : !u.hasLogin() ? "invited" : "active";
        return new CoachMemberDto(u.id, u.role, u.name, u.email, u.title, status, withInvite && "invited".equals(status) ? u.inviteCode : null, u.createdAt);
    }
}
