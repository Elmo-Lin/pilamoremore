package com.example.backend.admin;

import com.example.backend.auth.CurrentUser;
import com.example.backend.billing.Plans;
import com.example.backend.billing.SubscriptionService;
import com.example.backend.common.ApiException;
import com.example.backend.common.Domain;
import com.example.backend.domain.Coach;
import com.example.backend.domain.Subscription;
import com.example.backend.domain.UserAccount;
import com.example.backend.service.StudentService;
import com.example.backend.store.Db;
import com.google.api.core.ApiFuture;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.example.backend.web.Dtos.AdminOverviewDto;
import com.example.backend.web.Dtos.AdminUserDto;
import com.example.backend.web.Dtos.AdminWorkspaceDto;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * The service owner's own page: who uses Pila More More and on what terms, and 永久版 (free for
 * good) for friends. Admins are the emails in {@code pila.admin.emails}, signed in with an email
 * they've proven they own (Google, or a reset link) so nobody can register one to get in. To anyone
 * else these endpoints don't exist (404).
 */
@Service
public class AdminService {

    /** Taking 永久版 away leaves this long to subscribe before the workspace turns read-only. */
    static final Duration REVOKE_GRACE = Duration.ofDays(7);

    private final Db db;
    private final SubscriptionService subscriptions;
    private final Set<String> admins;

    public AdminService(Db db, SubscriptionService subscriptions, @Value("${pila.admin.emails:}") String emails) {
        this.db = db;
        this.subscriptions = subscriptions;
        this.admins = Arrays.stream(emails.split(",")).map(StudentService::key).filter(e -> !e.isEmpty()).collect(Collectors.toSet());
    }

    public boolean isAdmin(CurrentUser user) {
        if (admins.isEmpty()) return false;
        UserAccount u = db.get(db.doc(Db.USERS, user.userId()), UserAccount.class).orElse(null);
        if (u == null || u.email == null || Boolean.FALSE.equals(u.active) || !admins.contains(StudentService.key(u.email))) return false;
        // Proven: signed in with Google (accounts linked before emailVerified existed have only googleSub), or reset by email.
        return Boolean.TRUE.equals(u.emailVerified) || u.googleSub != null;
    }

    private void requireAdmin(CurrentUser user) {
        if (!isAdmin(user)) throw ApiException.notFound("找不到此頁面");
    }

    public AdminOverviewDto overview(CurrentUser user) {
        requireAdmin(user);
        Instant now = Instant.now();
        List<UserAccount> users = db.list(db.fs.collection(Db.USERS), UserAccount.class);
        Map<String, UserAccount> byId = users.stream().collect(Collectors.toMap(u -> u.id, Function.identity()));
        Map<String, Long> coachesBySpace = users.stream()
                .filter(u -> (Domain.COACH.equals(u.role) || Domain.OWNER.equals(u.role)) && !Boolean.FALSE.equals(u.active) && u.coachId != null)
                .collect(Collectors.groupingBy(u -> u.coachId, Collectors.counting()));

        List<AdminWorkspaceDto> rows = db.list(db.fs.collection(Db.COACHES), Coach.class).stream().map(space -> {
            Plans.Access access = Plans.access(space, now);
            Subscription sub = space.subscription;
            UserAccount owner = byId.get(space.id);
            boolean paying = SubscriptionService.hasMandate(sub);
            String kind = Domain.SPACE_STUDIO;
            String name = space.studio != null && !space.studio.isBlank() ? space.studio : owner != null ? owner.name : space.name;
            long students = Db.await(db.coachCol(space.id, Db.STUDENTS).whereEqualTo("status", "active").count().get()).getCount();
            boolean inUse = owner != null && space.id.equals(owner.coachId);
            return new AdminWorkspaceDto(space.id, kind, name, owner != null ? owner.name : space.name, owner != null ? owner.email : space.email, inUse,
                    access.plan().id(), access.status(), "trialing".equals(access.status()) ? access.trialEndsAt() : null,
                    sub != null ? sub.currentPeriodEnd : null, paying ? sub.monthlyAmount : 0, students, coachesBySpace.getOrDefault(space.id, 0L),
                    sub != null ? sub.extraStudentPacks : 0, sub != null ? sub.extraCoachSeats : 0, space.createdAt);
        }).sorted(Comparator.comparing(AdminWorkspaceDto::createdAt, Comparator.nullsLast(Comparator.reverseOrder()))).toList();

        // Who pays for their own workspace (by kind), and who was invited into someone else's.
        Map<String, Long> owners = new TreeMap<>(rows.stream().filter(AdminWorkspaceDto::inUse).collect(Collectors.groupingBy(AdminWorkspaceDto::kind, Collectors.counting())));
        Map<String, Long> members = new TreeMap<>();
        for (UserAccount u : users) {
            if (Domain.STUDENT.equals(u.role)) members.merge("student", 1L, Long::sum);
            else if (Domain.COACH.equals(u.role) && !u.id.equals(u.coachId)) members.merge("studioCoach", 1L, Long::sum);
        }
        // Workspaces their owners have left (they became students, or joined a studio) aren't counted.
        Map<String, Long> byStatus = new TreeMap<>(rows.stream().filter(AdminWorkspaceDto::inUse).collect(Collectors.groupingBy(AdminWorkspaceDto::status, Collectors.counting())));
        long signups7 = users.stream().filter(u -> u.createdAt != null && u.createdAt.isAfter(now.minus(Duration.ofDays(7)))).count();
        long signups30 = users.stream().filter(u -> u.createdAt != null && u.createdAt.isAfter(now.minus(Duration.ofDays(30)))).count();
        long paying = rows.stream().filter(r -> r.monthlyAmount() > 0).count();
        int mrr = rows.stream().mapToInt(AdminWorkspaceDto::monthlyAmount).sum();
        return new AdminOverviewDto(users.size(), owners, members, signups7, signups30, byStatus, paying, mrr, rows);
    }

    /**
     * Every account, newest first, with how much they use the app. Reads only the fields it counts
     * (who a student belongs to; who led or did a workout, and when), never names or training content.
     */
    public List<AdminUserDto> users(CurrentUser user) {
        requireAdmin(user);
        Instant since = Instant.now().minus(Duration.ofDays(30));
        List<UserAccount> users = db.list(db.fs.collection(Db.USERS), UserAccount.class);
        Map<String, Coach> spaces = db.list(db.fs.collection(Db.COACHES), Coach.class).stream().collect(Collectors.toMap(c -> c.id, Function.identity()));
        Map<String, UserAccount> byId = users.stream().collect(Collectors.toMap(u -> u.id, Function.identity()));

        // Fire every workspace's reads at once, then tally.
        Map<String, ApiFuture<QuerySnapshot>> studentReads = new HashMap<>();
        Map<String, ApiFuture<QuerySnapshot>> workoutReads = new HashMap<>();
        for (String id : users.stream().map(u -> u.coachId).filter(java.util.Objects::nonNull).collect(Collectors.toSet())) {
            studentReads.put(id, db.coachCol(id, Db.STUDENTS).select("coachId", "assignedCoachId", "status").get());
            workoutReads.put(id, db.coachCol(id, Db.WORKOUTS).select("coachId", "studentId", "status", "type", "startedAt").get());
        }
        Map<String, Long> students = new HashMap<>();
        for (ApiFuture<QuerySnapshot> read : studentReads.values()) {
            for (DocumentSnapshot s : Db.await(read).getDocuments()) {
                if (!"active".equals(s.getString("status"))) continue;
                String coach = s.getString("assignedCoachId") != null ? s.getString("assignedCoachId") : s.getString("coachId");
                if (coach != null) students.merge(coach, 1L, Long::sum);
            }
        }
        // Teachers are counted by the classes they led; students by their own sessions.
        Map<String, long[]> counts = new HashMap<>();
        Map<String, Instant> lastWorkout = new HashMap<>();
        for (ApiFuture<QuerySnapshot> read : workoutReads.values()) {
            for (DocumentSnapshot w : Db.await(read).getDocuments()) {
                if (!"completed".equals(w.getString("status"))) continue;
                Timestamp ts = w.getTimestamp("startedAt");
                Instant at = ts == null ? null : Instant.ofEpochSecond(ts.getSeconds(), ts.getNanos());
                List<String> whose = "coached".equals(w.getString("type")) ? Arrays.asList(w.getString("coachId"), w.getString("studentId")) : Arrays.asList(w.getString("studentId"));
                for (String id : whose) {
                    if (id == null) continue;
                    long[] c = counts.computeIfAbsent(id, k -> new long[2]);
                    c[0]++;
                    if (at != null && at.isAfter(since)) c[1]++;
                    if (at != null) lastWorkout.merge(id, at, (a, b) -> a.isAfter(b) ? a : b);
                }
            }
        }

        return users.stream().map(u -> {
            Coach space = u.coachId == null ? null : spaces.get(u.coachId);
            UserAccount owner = u.coachId == null ? null : byId.get(u.coachId);
            String spaceName = space == null ? null : space.studio != null && !space.studio.isBlank() ? space.studio : owner != null ? owner.name : space.name;
            boolean coach = Domain.COACH.equals(u.role) || Domain.OWNER.equals(u.role);
            String kind = Domain.OWNER.equals(u.role) ? "owner" : Domain.COACH.equals(u.role) ? "studioCoach" : "student";
            String login = u.googleSub != null ? "google" : u.appleSub != null ? "apple" : u.passwordHash != null ? "password" : "none";
            long[] c = counts.getOrDefault(u.id, new long[2]);
            return new AdminUserDto(u.id, kind, u.name, u.email, u.coachId, spaceName, login, !Boolean.FALSE.equals(u.active), u.createdAt, u.lastSeenAt,
                    coach ? students.getOrDefault(u.id, 0L) : 0, c[0], c[1], lastWorkout.get(u.id));
        }).sorted(Comparator.comparing(AdminUserDto::createdAt, Comparator.nullsLast(Comparator.reverseOrder()))).toList();
    }

    /** 永久版: the workspace never lapses and is never charged (a running card mandate is stopped). */
    public void setComplimentary(CurrentUser user, String spaceId, int extraStudentPacks, int extraCoachSeats) {
        requireAdmin(user);
        if (db.get(db.doc(Db.COACHES, spaceId), Coach.class).isEmpty()) throw ApiException.notFound("找不到此工作空間");
        subscriptions.stopCharging(spaceId);
        Coach space = db.get(db.doc(Db.COACHES, spaceId), Coach.class).orElseThrow();
        Subscription sub = space.subscription != null ? space.subscription : new Subscription();
        sub.status = "complimentary";
        sub.extraStudentPacks = extraStudentPacks;
        sub.extraCoachSeats = extraCoachSeats;
        sub.nextExtraStudentPacks = null;
        sub.nextExtraCoachSeats = null;
        sub.monthlyAmount = 0;
        db.update(db.doc(Db.COACHES, spaceId), "subscription", db.encode(sub));
    }

    /** Back to paying: a week to subscribe, then read-only like any lapsed plan. Their data stays. */
    public void revokeComplimentary(CurrentUser user, String spaceId) {
        requireAdmin(user);
        Coach space = db.get(db.doc(Db.COACHES, spaceId), Coach.class).orElseThrow(() -> ApiException.notFound("找不到此工作空間"));
        Subscription sub = space.subscription;
        if (sub == null || !"complimentary".equals(sub.status)) throw ApiException.conflict("not_complimentary", "這個工作空間不是永久版");
        Instant now = Instant.now();
        sub.status = "canceled";
        sub.currentPeriodStart = now;
        sub.currentPeriodEnd = now.plus(REVOKE_GRACE);
        db.update(db.doc(Db.COACHES, spaceId), "subscription", db.encode(sub));
    }
}
