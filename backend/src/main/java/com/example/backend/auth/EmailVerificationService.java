package com.example.backend.auth;

import com.example.backend.common.ApiException;
import com.example.backend.domain.UserAccount;
import com.example.backend.mail.MailService;
import com.example.backend.store.Db;
import com.google.cloud.Timestamp;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Proves a new account's email: a one-time link, valid for a day, mailed after signing up with a
 * password. Until it is opened the account can sign in but use nothing else (see
 * {@link CurrentUserResolver}). Accounts from before this existed ({@code emailVerified} unset) are
 * left as they are. Only the token's SHA-256 is stored ({@code emailVerifications/{hash}}). Every link
 * mailed works until it expires, and signs in once: mail apps and scanners often open a link before
 * the person does, and people open an older email, so neither should look like a broken link.
 */
@Service
public class EmailVerificationService {

    static final Duration TTL = Duration.ofHours(24);
    /** One email per account per minute, so "resend" cannot be used to flood an inbox. */
    static final Duration COOLDOWN = Duration.ofMinutes(1);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Db db;
    private final MailService mail;
    private final String appUrl;
    private final boolean required;

    public EmailVerificationService(Db db, MailService mail, @Value("${pila.app-url}") String appUrl,
            @Value("${pila.auth.verify-email}") boolean required) {
        this.db = db;
        this.mail = mail;
        this.appUrl = appUrl.replaceAll("/$", "");
        this.required = required;
    }

    /** {@code emailVerifications/{sha256(token)}}. */
    public static class EmailVerification {
        public String userId;
        /** The address the link was sent to: it proves nothing about another one the account changes to. */
        public String email;
        public Instant expiresAt;
        public Instant createdAt;
    }

    /** Whether new password sign-ups must prove their email. */
    public boolean required() {
        return required;
    }

    /** Mails a fresh link to an account still waiting for one; earlier links keep working until they expire. */
    public void send(String userId) {
        UserAccount u = db.get(db.doc(Db.USERS, userId), UserAccount.class).orElse(null);
        if (u == null || u.email == null || !Boolean.FALSE.equals(u.emailVerified)) return;

        Instant now = Instant.now();
        var earlier = Db.await(db.fs.collection(Db.EMAIL_VERIFICATIONS).whereEqualTo("userId", u.id).get()).getDocuments();
        if (earlier.stream().anyMatch(d -> d.getTimestamp("createdAt") != null && d.getTimestamp("createdAt").toDate().toInstant().isAfter(now.minus(COOLDOWN)))) return;
        deleteExpired(now);

        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        EmailVerification v = new EmailVerification();
        v.userId = u.id;
        v.email = u.email;
        v.createdAt = now;
        v.expiresAt = now.plus(TTL);
        db.create(db.doc(Db.EMAIL_VERIFICATIONS, PasswordResetService.hash(token)), v);

        String link = appUrl + "/verify-email?token=" + token;
        String name = u.name == null || u.name.isBlank() ? "你好" : u.name + " 你好";
        String text = name + "：\n\n歡迎使用 Pila More More！請在 24 小時內點下面的連結驗證你的 Email，完成後就能開始使用：\n\n" + link
                + "\n\n如果你沒有註冊，請忽略這封信。\n\nPila More More";
        String html = "<p>" + escape(name) + "：</p><p>歡迎使用 Pila More More！請在 24 小時內點下面的按鈕驗證你的 Email，完成後就能開始使用。</p>"
                + "<p><a href=\"" + link + "\" style=\"display:inline-block;padding:10px 18px;background:#a54f74;color:#fff;border-radius:8px;text-decoration:none\">驗證 Email</a></p>"
                + "<p style=\"color:#6e6e73;font-size:13px\">按鈕無法使用時，請複製這個網址到瀏覽器：<br>" + link + "</p>"
                + "<p style=\"color:#6e6e73;font-size:13px\">如果你沒有註冊，請忽略這封信。</p>";
        mail.send(u.email, "驗證你的 Pila More More 帳號", text, html);
    }

    /** Spent links stay until they expire, to recognise a second visit; any new sign-up clears out old ones. */
    private void deleteExpired(Instant now) {
        Timestamp cutoff = Timestamp.ofTimeSecondsAndNanos(now.getEpochSecond(), now.getNano());
        Db.await(db.fs.collection(Db.EMAIL_VERIFICATIONS).whereLessThan("expiresAt", cutoff).limit(100).get()).getDocuments()
                .forEach(d -> db.delete(d.getReference()));
    }

    /** Marks the email proven; returns the account to sign in. Only the first visit signs in. */
    public String verify(String token) {
        var ref = db.doc(Db.EMAIL_VERIFICATIONS, PasswordResetService.hash(token.trim()));
        return db.transaction(tx -> {
            EmailVerification v = tx.get(ref, EmailVerification.class).orElse(null);
            if (v == null || v.expiresAt == null || v.expiresAt.isBefore(Instant.now())) {
                throw ApiException.badRequest("這個驗證連結已過期，請登入後重新寄送。已經驗證過的話，直接登入即可");
            }
            var userRef = db.doc(Db.USERS, v.userId);
            UserAccount u = tx.get(userRef, UserAccount.class).orElse(null);
            if (u == null || u.email == null || !u.email.toLowerCase(Locale.ROOT).equals(v.email.toLowerCase(Locale.ROOT))) {
                throw ApiException.badRequest("驗證連結已失效，請登入後重新寄送");
            }
            if (Boolean.FALSE.equals(u.active)) throw ApiException.unauthorized("此帳號已停用，請聯絡工作室");
            if (!Boolean.FALSE.equals(u.emailVerified)) throw ApiException.conflict("already_verified", "這個 Email 已經驗證過了，直接登入即可");
            tx.update(userRef, "emailVerified", true);
            return u.id;
        });
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
