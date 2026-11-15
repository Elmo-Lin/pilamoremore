package com.example.backend.push;

import com.example.backend.auth.CurrentUser;
import com.example.backend.common.ApiException;
import com.example.backend.domain.UserAccount;
import com.example.backend.mail.MailService;
import com.example.backend.store.Db;
import com.example.backend.web.Dtos.PushSubscriptionInput;
import com.google.cloud.firestore.DocumentReference;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/**
 * Notifications: each device that allowed them ({@code pushSubscriptions/{sha256(endpoint)}}) gets a
 * push; someone none of whose devices took it gets an email instead, unless they turned that off.
 * Failures are logged, never thrown, so a notification can't break the action that caused it.
 */
@Service
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);

    /**
     * The push services browsers subscribe through. The endpoint comes from the browser, and the server
     * posts to it, so only these hosts are accepted (no requests to internal addresses).
     */
    private static final List<String> PUSH_HOSTS = List.of(
            "web.push.apple.com", "fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "notify.windows.com");

    /** {@code url}: the app page the notification opens. */
    public record Message(String title, String body, String url) {}

    /** {@code pushSubscriptions/{sha256(endpoint)}}: one device of one user. */
    public static class Subscription {
        public String userId;
        public String endpoint;
        public String p256dh;
        public String auth;
        public Instant createdAt;
    }

    private final Db db;
    private final WebPush push;
    private final MailService mail;
    private final String appUrl;
    private final JsonMapper json = JsonMapper.builder().build();

    public PushService(Db db, WebPush push, MailService mail, @Value("${pila.app-url}") String appUrl) {
        this.db = db;
        this.push = push;
        this.mail = mail;
        this.appUrl = appUrl.replaceAll("/$", "");
    }

    public boolean enabled() {
        return push.enabled();
    }

    public String publicKey() {
        return push.publicKey();
    }

    /** This device now notifies whoever is signed in on it (a shared phone follows the latest sign-in). */
    public void subscribe(CurrentUser user, PushSubscriptionInput in) {
        if (!push.enabled()) throw ApiException.conflict("push_off", "通知功能尚未開放");
        URI uri;
        try {
            uri = URI.create(in.endpoint());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("推播位址不正確");
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        boolean known = PUSH_HOSTS.stream().anyMatch(h -> host.equals(h) || host.endsWith("." + h));
        if (!"https".equals(uri.getScheme()) || !known) throw ApiException.badRequest("不支援這個瀏覽器的推播服務");
        try {
            if (WebPush.decode(in.keys().p256dh()).length != 65 || WebPush.decode(in.keys().auth()).length != 16) throw new IllegalArgumentException();
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("推播金鑰不正確");
        }
        Subscription s = new Subscription();
        s.userId = user.userId();
        s.endpoint = in.endpoint();
        s.p256dh = in.keys().p256dh();
        s.auth = in.keys().auth();
        s.createdAt = Instant.now();
        db.set(ref(in.endpoint()), s);
    }

    /** Signing out, or turning notifications off, on this device. */
    public void unsubscribe(CurrentUser user, String endpoint) {
        DocumentReference ref = ref(endpoint);
        db.get(ref, Subscription.class).filter(s -> user.userId().equals(s.userId)).ifPresent(s -> db.delete(ref));
    }

    public boolean emailReminders(CurrentUser user) {
        return db.get(db.doc(Db.USERS, user.userId()), UserAccount.class).map(u -> !Boolean.FALSE.equals(u.emailReminders)).orElse(true);
    }

    public void setEmailReminders(CurrentUser user, boolean on) {
        db.update(db.doc(Db.USERS, user.userId()), "emailReminders", on ? null : false);
    }

    /** Pushes to each of the user's devices; returns how many accepted it. Gone devices are forgotten. */
    public int push(String userId, Message message) {
        if (!push.enabled()) return 0;
        byte[] payload = json.writeValueAsString(Map.of("title", message.title(), "body", message.body(), "url", message.url()))
                .getBytes(StandardCharsets.UTF_8);
        int delivered = 0;
        for (Subscription s : db.list(db.fs.collection(Db.PUSH_SUBSCRIPTIONS).whereEqualTo("userId", userId), Subscription.class)) {
            try {
                int status = push.send(s.endpoint, s.p256dh, s.auth, payload);
                if (status == 404 || status == 410) db.delete(ref(s.endpoint));
                else if (status / 100 == 2) delivered++;
                else log.warn("Push service {} answered {}", URI.create(s.endpoint).getHost(), status);
            } catch (Exception e) {
                log.warn("Push to {} failed: {}", URI.create(s.endpoint).getHost(), e.toString());
            }
        }
        return delivered;
    }

    /** Push, or email when no device took it (people who can sign in, and haven't turned email reminders off). */
    public void notify(String userId, Message message) {
        try {
            if (push(userId, message) > 0) return;
            UserAccount u = db.get(db.doc(Db.USERS, userId), UserAccount.class).orElse(null);
            if (u == null || u.email == null || !u.hasLogin() || Boolean.FALSE.equals(u.active) || Boolean.FALSE.equals(u.emailReminders)) return;
            String link = appUrl + message.url();
            String footer = "不想收到 Email 提醒，可以在網站右上角帳號選單的「通知設定」關閉。";
            String text = message.body() + "\n\n" + link + "\n\n" + footer + "\n\nPila More More";
            String html = "<p>" + escape(message.body()) + "</p>"
                    + "<p><a href=\"" + link + "\" style=\"display:inline-block;padding:10px 18px;background:#a54f74;color:#fff;border-radius:8px;text-decoration:none\">打開 Pila More More</a></p>"
                    + "<p style=\"color:#6e6e73;font-size:13px\">" + footer + "</p>";
            mail.send(u.email, message.title() + "｜Pila More More", text, html);
        } catch (Exception e) {
            log.warn("Notifying {} failed: {}", userId, e.toString());
        }
    }

    private DocumentReference ref(String endpoint) {
        try {
            return db.doc(Db.PUSH_SUBSCRIPTIONS, HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(endpoint.getBytes(StandardCharsets.UTF_8))));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
