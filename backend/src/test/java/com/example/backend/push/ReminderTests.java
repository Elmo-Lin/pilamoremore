package com.example.backend.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.backend.mail.MailService;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Devices subscribe; the day-before run and class changes reach them, or the inbox when there is no device. */
@SpringBootTest
@AutoConfigureMockMvc
class ReminderTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    ReminderService reminders;

    /** The push services themselves are out of reach in tests; what we'd send is captured here. */
    @MockitoBean
    WebPush webPush;

    @MockitoBean
    MailService mail;

    final JsonMapper json = JsonMapper.builder().build();
    String suffix;
    String coach;
    String coachEmail;
    String studentId;
    String student;
    String endpoint;

    record Resp(int status, JsonNode body) {}

    Resp call(MockHttpServletRequestBuilder req, String token, Object body) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        MvcResult res = mvc.perform(req).andReturn();
        String text = res.getResponse().getContentAsString(StandardCharsets.UTF_8);
        return new Resp(res.getResponse().getStatus(), text.isEmpty() ? null : json.readTree(text));
    }

    static String b64(int bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[bytes]);
    }

    Map<String, Object> subscription(String url) {
        return Map.of("endpoint", url, "keys", Map.of("p256dh", b64(65), "auth", b64(16)));
    }

    Map<String, Object> slot(Instant at) {
        return Map.of("studentId", studentId, "startAt", at.toString(), "durationMin", 60, "location", "工作室");
    }

    static boolean says(byte[] payload, String text) {
        return new String(payload, StandardCharsets.UTF_8).contains(text);
    }

    @BeforeEach
    void setUp() throws Exception {
        when(webPush.enabled()).thenReturn(true);
        when(webPush.publicKey()).thenReturn("server-key");
        when(webPush.send(anyString(), anyString(), anyString(), any())).thenReturn(201);
        suffix = UUID.randomUUID().toString().substring(0, 8);
        coachEmail = "push-coach-" + suffix + "@example.com";
        coach = call(MockMvcRequestBuilders.post("/api/auth/register-studio"), null, Map.of("name", "老師", "email", coachEmail, "password", "password123", "studio", "提醒工作室"))
                .body().get("token").asString();
        studentId = call(MockMvcRequestBuilders.post("/api/students"), coach, Map.of("name", "小美", "email", "push-stu-" + suffix + "@example.com",
                "gender", "female", "goal", "core", "weeklyFrequency", 2, "status", "active")).body().get("id").asString();
        String code = call(MockMvcRequestBuilders.post("/api/students/" + studentId + "/invite"), coach, null).body().get("inviteCode").asString();
        student = call(MockMvcRequestBuilders.post("/api/auth/activate"), null, Map.of("inviteCode", code, "password", "student123")).body().get("token").asString();
        endpoint = "https://fcm.googleapis.com/fcm/send/" + suffix;
    }

    @Test
    void onlyKnownPushServicesCanBeSubscribed() throws Exception {
        assertThat(call(MockMvcRequestBuilders.put("/api/push/subscription"), student, subscription("https://169.254.169.254/latest/meta-data")).status())
                .as("no requests to internal addresses").isEqualTo(400);
        assertThat(call(MockMvcRequestBuilders.put("/api/push/subscription"), student, subscription("http://fcm.googleapis.com/x")).status()).isEqualTo(400);
        assertThat(call(MockMvcRequestBuilders.put("/api/push/subscription"), student, subscription(endpoint)).status()).isEqualTo(204);
        assertThat(call(MockMvcRequestBuilders.get("/api/push/key"), student, null).body().get("publicKey").asString()).isEqualTo("server-key");
    }

    @Test
    void theDayBeforeTheStudentAndTheCoachHear() throws Exception {
        // A day of its own, far ahead, so no other test's classes fall on it.
        LocalDate today = LocalDate.now(ReminderService.ZONE).plusYears(5).plusDays(ThreadLocalRandom.current().nextInt(3000));
        Instant at = today.plusDays(1).atTime(19, 0).atZone(ReminderService.ZONE).toInstant();
        assertThat(call(MockMvcRequestBuilders.put("/api/appointments/apt_e" + suffix), coach, slot(at)).status()).isEqualTo(200);
        call(MockMvcRequestBuilders.put("/api/push/subscription"), student, subscription(endpoint));

        assertThat(reminders.remindTomorrow(today)).isEqualTo(2);
        verify(webPush).send(eq(endpoint), anyString(), anyString(), argThat(p -> says(p, "明天有課") && says(p, "19:00")));
        verify(mail).send(eq(coachEmail), contains("明天有 1 堂課"), contains("小美"), anyString()); // no device: by email
        assertThat(reminders.remindTomorrow(today)).as("a retried run sends nothing").isEqualTo(-1);

        clearInvocations(mail);
        assertThat(call(MockMvcRequestBuilders.put("/api/push/settings"), coach, Map.of("emailReminders", false)).status()).isEqualTo(200);
        assertThat(call(MockMvcRequestBuilders.get("/api/push/settings"), coach, null).body().get("emailReminders").asBoolean()).isFalse();
        call(MockMvcRequestBuilders.put("/api/appointments/apt_f" + suffix), coach, slot(at.plusSeconds(86400)));
        reminders.remindTomorrow(today.plusDays(1));
        verify(mail, never()).send(eq(coachEmail), anyString(), anyString(), anyString());
    }

    @Test
    void movingOrCancellingAComingClassTellsTheStudentAtOnce() throws Exception {
        String id = "apt_m" + suffix;
        Instant at = Instant.now().plusSeconds(3 * 86400);
        call(MockMvcRequestBuilders.put("/api/appointments/" + id), coach, slot(at));
        call(MockMvcRequestBuilders.put("/api/push/subscription"), student, subscription(endpoint));
        verify(webPush, never()).send(anyString(), anyString(), anyString(), any());

        call(MockMvcRequestBuilders.put("/api/appointments/" + id), coach, slot(at.plusSeconds(3600)));
        verify(webPush).send(eq(endpoint), anyString(), anyString(), argThat(p -> says(p, "課程時間已更改")));
        assertThat(call(MockMvcRequestBuilders.delete("/api/appointments/" + id), coach, null).status()).isEqualTo(204);
        verify(webPush).send(eq(endpoint), anyString(), anyString(), argThat(p -> says(p, "課程已取消")));
        verify(mail, never()).send(eq(coachEmail), anyString(), anyString(), anyString()); // they made the change themselves

        call(MockMvcRequestBuilders.post("/api/push/unsubscribe"), student, Map.of("endpoint", endpoint));
        clearInvocations(webPush);
        call(MockMvcRequestBuilders.put("/api/appointments/apt_n" + suffix), coach, slot(at));
        call(MockMvcRequestBuilders.delete("/api/appointments/apt_n" + suffix), coach, null);
        verify(webPush, never()).send(anyString(), anyString(), anyString(), any());
    }

    @Test
    void theDayBeforeRunNeedsTheSchedulersKey() throws Exception {
        assertThat(call(MockMvcRequestBuilders.post("/api/internal/reminders"), null, null).status()).isEqualTo(404);
        assertThat(call(MockMvcRequestBuilders.post("/api/internal/reminders").header("X-Reminder-Key", "guess"), null, null).status()).isEqualTo(404);
        assertThat(call(MockMvcRequestBuilders.post("/api/internal/reminders").header("X-Reminder-Key", "test-reminder-key"), null, null).status()).isEqualTo(200);
    }
}
