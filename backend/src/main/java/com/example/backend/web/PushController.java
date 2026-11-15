package com.example.backend.web;

import com.example.backend.auth.CurrentUser;
import com.example.backend.common.ApiException;
import com.example.backend.push.PushService;
import com.example.backend.push.ReminderService;
import com.example.backend.web.Dtos.NotificationSettingsDto;
import com.example.backend.web.Dtos.PushEndpointInput;
import com.example.backend.web.Dtos.PushSubscriptionInput;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Class reminders: this device's notifications, the email fallback, and the day-before run. */
@RestController
@RequestMapping("/api")
public class PushController {

    private final PushService push;
    private final ReminderService reminders;
    private final String reminderKey;

    public PushController(PushService push, ReminderService reminders, @Value("${pila.reminders.key:}") String reminderKey) {
        this.push = push;
        this.reminders = reminders;
        this.reminderKey = reminderKey;
    }

    /** The key browsers subscribe with; {@code enabled: false} until the server has VAPID keys. */
    @GetMapping("/push/key")
    public Map<String, Object> key(CurrentUser user) {
        return Map.of("enabled", push.enabled(), "publicKey", push.publicKey());
    }

    @PutMapping("/push/subscription")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void subscribe(CurrentUser user, @Valid @RequestBody PushSubscriptionInput in) {
        push.subscribe(user, in);
    }

    /** A POST, so signing out can send it with {@code keepalive} as the page changes. */
    @PostMapping("/push/unsubscribe")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unsubscribe(CurrentUser user, @Valid @RequestBody PushEndpointInput in) {
        push.unsubscribe(user, in.endpoint());
    }

    @GetMapping("/push/settings")
    public NotificationSettingsDto settings(CurrentUser user) {
        return new NotificationSettingsDto(push.emailReminders(user));
    }

    @PutMapping("/push/settings")
    public NotificationSettingsDto saveSettings(CurrentUser user, @Valid @RequestBody NotificationSettingsDto in) {
        push.setEmailReminders(user, in.emailReminders());
        return in;
    }

    /**
     * The day-before reminder for tomorrow's classes (1 p.m. Taiwan time), called by Cloud Scheduler with the shared key
     * ({@code X-Reminder-Key}, from Secret Manager). Without a configured key the endpoint is off.
     */
    @PostMapping("/internal/reminders")
    public Map<String, Object> remind(@RequestHeader(name = "X-Reminder-Key", required = false) String key) {
        if (reminderKey.isBlank() || key == null
                || !MessageDigest.isEqual(reminderKey.getBytes(StandardCharsets.UTF_8), key.getBytes(StandardCharsets.UTF_8))) {
            throw ApiException.notFound("找不到此頁面");
        }
        int notified = reminders.remindTomorrow(LocalDate.now(ZoneId.of("Asia/Taipei")));
        return Map.of("notified", Math.max(notified, 0), "alreadySent", notified < 0);
    }
}
