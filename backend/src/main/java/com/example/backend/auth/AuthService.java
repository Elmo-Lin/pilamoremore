package com.example.backend.auth;

import com.example.backend.auth.AppleTokenVerifier.AppleUser;
import com.example.backend.auth.GoogleTokenVerifier.GoogleUser;
import com.example.backend.billing.Plans;
import com.example.backend.common.ApiException;
import com.example.backend.common.Domain;
import com.example.backend.common.Ids;
import com.example.backend.domain.Coach;
import com.example.backend.domain.Invite;
import com.example.backend.domain.Student;
import com.example.backend.domain.UserAccount;
import com.example.backend.service.StudentService.EmailOwner;
import com.example.backend.store.Db;
import com.example.backend.web.Dtos.ActivateInput;
import com.example.backend.web.Dtos.AppleAuthInput;
import com.example.backend.web.Dtos.AuthResponse;
import com.example.backend.web.Dtos.GoogleAuthInput;
import com.example.backend.web.Dtos.LoginInput;
import com.example.backend.web.Dtos.MeDto;
import com.example.backend.web.Dtos.RegisterStudioInput;
import java.time.Instant;
import java.util.Locale;
import java.util.function.Consumer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final Db db;
    private final PasswordEncoder passwords;
    private final TokenService tokens;
    private final GoogleTokenVerifier google;
    private final AppleTokenVerifier apple;
    private final LoginGuard guard;
    /** New password accounts must open the mailed link before using the app (see EmailVerificationService). */
    private final boolean verifyEmail;

    public AuthService(Db db, PasswordEncoder passwords, TokenService tokens, GoogleTokenVerifier google, AppleTokenVerifier apple, LoginGuard guard,
            @Value("${pila.auth.verify-email}") boolean verifyEmail) {
        this.db = db;
        this.passwords = passwords;
        this.tokens = tokens;
        this.google = google;
        this.apple = apple;
        this.guard = guard;
        this.verifyEmail = verifyEmail;
    }

    /** A studio owner: a coach whose workspace is a studio they can invite other coaches into. */
    public AuthResponse registerStudio(RegisterStudioInput in) {
        return issue(createOwner(in.name(), in.email(), passwords.encode(in.password()), Identity.PASSWORD, in.studio()));
    }

    /**
     * Sign in with Google. Google has verified the email, so an existing account with that email is
     * linked (and an invited student or teacher is activated). A new user signs up their studio.
     */
    public AuthResponse google(GoogleAuthInput in) {
        GoogleUser g = google.verify(in.credential());
        UserAccount existing = db.get(db.doc(Db.EMAILS, key(g.email())), EmailOwner.class)
                .flatMap(o -> db.get(db.doc(Db.USERS, o.userId), UserAccount.class))
                .orElse(null);
        if (existing != null) {
            if (existing.googleSub != null && !existing.googleSub.equals(g.sub())) throw ApiException.unauthorized("此 Email 已綁定其他 Google 帳號");
            if (Boolean.FALSE.equals(existing.active)) throw ApiException.unauthorized("此帳號已停用，請聯絡工作室");
            if (existing.googleSub == null) {
                link(existing, x -> x.googleSub = g.sub());
                existing.googleSub = g.sub();
            }
            return issue(existing);
        }
        if (in.accountType() == null) throw ApiException.conflict("signup_required", "第一次使用 Google 登入，請建立你的工作室");
        String name = in.name() != null && !in.name().isBlank() ? in.name() : g.name().isBlank() ? g.email().split("@")[0] : g.name();
        return issue(createFor(name, g.email(), new Identity(g.sub(), null), in.accountType(), in.studio()));
    }

    /**
     * Sign in with Apple. Apple only names the email on the first sign-in (later ones may not), so an
     * account is found by its Apple ID first. Apple has verified the email, so an existing account
     * with it is linked. A new user signs up their studio; Apple sends their name only to the app.
     */
    public AuthResponse apple(AppleAuthInput in) {
        AppleUser a = apple.verify(in.identityToken());
        UserAccount existing = db.list(db.fs.collection(Db.USERS).whereEqualTo("appleSub", a.sub()), UserAccount.class).stream().findFirst().orElse(null);
        if (existing == null && a.email() != null) {
            existing = db.get(db.doc(Db.EMAILS, key(a.email())), EmailOwner.class)
                    .flatMap(o -> db.get(db.doc(Db.USERS, o.userId), UserAccount.class))
                    .orElse(null);
            if (existing != null && existing.appleSub != null) throw ApiException.unauthorized("此 Email 已綁定其他 Apple 帳號");
        }
        if (existing != null) {
            if (Boolean.FALSE.equals(existing.active)) throw ApiException.unauthorized("此帳號已停用，請聯絡工作室");
            if (existing.appleSub == null) {
                link(existing, x -> x.appleSub = a.sub());
                existing.appleSub = a.sub();
            }
            return issue(existing);
        }
        if (a.email() == null) throw ApiException.badRequest("Apple 沒有提供 Email，無法建立帳號，請改用其他方式註冊");
        if (in.accountType() == null) throw ApiException.conflict("signup_required", "第一次使用 Apple 登入，請建立你的工作室");
        String name = in.name() != null && !in.name().isBlank() ? in.name().trim() : a.email().split("@")[0];
        return issue(createFor(name, a.email(), new Identity(null, a.sub()), in.accountType(), in.studio()));
    }

    /** A new account signing in through Google or Apple: a studio owner (the only kind that signs up). */
    private UserAccount createFor(String rawName, String email, Identity identity, String accountType, String studio) {
        String name = rawName.length() > 30 ? rawName.substring(0, 30) : rawName;
        if (!Domain.SPACE_STUDIO.equals(accountType)) throw ApiException.badRequest("Pila More More 目前只提供工作室註冊；老師與學員請使用工作室給的邀請碼");
        if (studio == null || studio.isBlank()) throw ApiException.badRequest("請輸入工作室名稱");
        return createOwner(name, email, null, identity, studio);
    }

    /** A new token for the caller's current role (e.g. after a paid upgrade to a studio). */
    public AuthResponse refresh(CurrentUser user) {
        return issueFor(user.userId());
    }

    /** A studio owner and their studio, which starts its free trial. */
    private UserAccount createOwner(String name, String rawEmail, String passwordHash, Identity identity, String studioName) {
        String email = rawEmail.trim();
        Instant now = Instant.now();
        UserAccount u = new UserAccount();
        u.id = Ids.newId("coach");
        u.role = Domain.OWNER;
        u.name = name.trim();
        u.email = email;
        u.coachId = u.id;
        u.passwordHash = passwordHash;
        u.googleSub = identity.googleSub();
        u.appleSub = identity.appleSub();
        u.emailVerified = initialVerified(identity);
        u.createdAt = now;
        Coach c = new Coach();
        c.id = u.id;
        c.kind = Domain.SPACE_STUDIO;
        c.name = u.name;
        c.email = email;
        c.title = "老師";
        c.studio = studioName == null ? "" : studioName.trim();
        c.subscription = Plans.trial(now);
        c.createdAt = now;
        createAccount(u, tx -> tx.create(db.doc(Db.COACHES, c.id), c));
        return u;
    }

    /** How a new account signs in: a password (neither), or a Google or Apple account. */
    private record Identity(String googleSub, String appleSub) {
        static final Identity PASSWORD = new Identity(null, null);
    }

    /** Google and Apple have proven the email; a password sign-up has yet to. */
    private Boolean initialVerified(Identity identity) {
        return identity != Identity.PASSWORD ? Boolean.TRUE : verifyEmail ? Boolean.FALSE : null;
    }

    private interface TxWrites {
        void run(Db.Tx tx) throws Exception;
    }

    /** Claims the email and creates the user plus their workspace documents in one transaction. */
    private void createAccount(UserAccount u, TxWrites writes) {
        db.transaction(tx -> {
            var emailRef = db.doc(Db.EMAILS, key(u.email));
            if (tx.get(emailRef, EmailOwner.class).isPresent()) throw ApiException.conflict("email_taken", "此 Email 已註冊");
            tx.create(emailRef, new EmailOwner(u.id));
            tx.create(db.doc(Db.USERS, u.id), u);
            writes.run(tx);
            return null;
        });
    }

    /**
     * Remembers the Google or Apple account; an invited student or studio coach is activated by it.
     * An unverified account's password is dropped (see below); its owner can set a new one by email.
     */
    private void link(UserAccount u, Consumer<UserAccount> setIdentity) {
        db.transaction(tx -> {
            var userRef = db.doc(Db.USERS, u.id);
            UserAccount fresh = tx.get(userRef, UserAccount.class).orElseThrow(() -> ApiException.unauthorized("帳號不存在"));
            var studentRef = db.coachDoc(fresh.coachId, Db.STUDENTS, fresh.id);
            Student student = Domain.STUDENT.equals(fresh.role) ? tx.get(studentRef, Student.class).orElse(null) : null;
            String code = student != null ? student.inviteCode : fresh.inviteCode;
            if (code != null) tx.delete(db.doc(Db.INVITES, code));
            if (student != null && !Boolean.TRUE.equals(student.activated)) {
                student.activated = true;
                student.inviteCode = null;
                tx.set(studentRef, student);
            }
            // Signing up with a password never proved the email: someone could have registered it first,
            // waiting for its owner to arrive through Google or Apple. Their password stops working here.
            if (!Boolean.TRUE.equals(fresh.emailVerified)) fresh.passwordHash = null;
            fresh.emailVerified = true;
            setIdentity.accept(fresh);
            fresh.inviteCode = null;
            tx.set(userRef, fresh);
            return null;
        });
    }

    public AuthResponse login(LoginInput in) {
        guard.check(in.email());
        UserAccount u = db.get(db.doc(Db.EMAILS, key(in.email())), EmailOwner.class)
                .flatMap(o -> db.get(db.doc(Db.USERS, o.userId), UserAccount.class))
                .orElse(null);
        // Same message for unknown email and wrong password — don't reveal which accounts exist.
        if (u == null || u.passwordHash == null || !passwords.matches(in.password(), u.passwordHash)) {
            guard.failed(in.email());
            throw ApiException.unauthorized("Email 或密碼不正確");
        }
        if (Boolean.FALSE.equals(u.active)) throw ApiException.unauthorized("此帳號已停用，請聯絡工作室");
        guard.succeeded(in.email());
        return issue(u);
    }

    /** A student (code from their coach) or a studio coach (code from the owner) sets their password. */
    public AuthResponse activate(ActivateInput in) {
        String code = in.inviteCode().trim().toUpperCase(Locale.ROOT);
        String hash = passwords.encode(in.password());
        UserAccount u = db.transaction(tx -> {
            var inviteRef = db.doc(Db.INVITES, code);
            Invite invite = tx.get(inviteRef, Invite.class).orElseThrow(() -> ApiException.badRequest("邀請碼無效"));
            boolean forCoach = "coach".equals(invite.kind);
            if (invite.expiresAt == null || invite.expiresAt.isBefore(Instant.now())) {
                throw ApiException.badRequest(forCoach ? "邀請碼已過期，請向工作室索取新的邀請碼" : "邀請碼已過期，請向老師索取新的邀請碼");
            }
            var userRef = db.doc(Db.USERS, invite.studentId);
            if (forCoach) {
                UserAccount coach = tx.get(userRef, UserAccount.class).orElseThrow(() -> ApiException.badRequest("邀請碼無效"));
                if (Boolean.FALSE.equals(coach.active)) throw ApiException.badRequest("邀請碼無效");
                coach.passwordHash = hash;
                coach.inviteCode = null;
                // The owner typed this email and the code may have come by any channel: prove it like a sign-up.
                if (verifyEmail && !Boolean.TRUE.equals(coach.emailVerified)) coach.emailVerified = false;
                tx.set(userRef, coach);
                tx.delete(inviteRef);
                return coach;
            }
            var studentRef = db.coachDoc(invite.coachId, Db.STUDENTS, invite.studentId);
            UserAccount account = tx.get(userRef, UserAccount.class).orElseThrow(() -> ApiException.badRequest("邀請碼無效"));
            Student student = tx.get(studentRef, Student.class).orElseThrow(() -> ApiException.badRequest("邀請碼無效"));
            account.passwordHash = hash;
            if (verifyEmail && !Boolean.TRUE.equals(account.emailVerified)) account.emailVerified = false;
            student.activated = true;
            student.inviteCode = null;
            tx.set(userRef, account);
            tx.set(studentRef, student);
            tx.delete(inviteRef);
            return account;
        });
        return issue(u);
    }

    public MeDto me(CurrentUser user) {
        UserAccount u = db.get(db.doc(Db.USERS, user.userId()), UserAccount.class).orElseThrow(() -> ApiException.unauthorized("帳號不存在"));
        return toMe(u);
    }

    public AuthResponse issueFor(String userId) {
        return issue(db.get(db.doc(Db.USERS, userId), UserAccount.class).orElseThrow(() -> ApiException.notFound("找不到帳號")));
    }

    private AuthResponse issue(UserAccount u) {
        TokenService.IssuedToken t = tokens.issue(u.id, u.role, u.coachId);
        return new AuthResponse(t.token(), t.expiresAt(), toMe(u));
    }

    private static MeDto toMe(UserAccount u) {
        return new MeDto(u.id, u.role, u.name, u.email, u.coachId, Domain.COACH.equals(u.role) || Domain.OWNER.equals(u.role) ? null : u.id,
                !Boolean.FALSE.equals(u.emailVerified));
    }

    private static String key(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
