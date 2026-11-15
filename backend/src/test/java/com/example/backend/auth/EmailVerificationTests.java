package com.example.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.example.backend.domain.UserAccount;
import com.example.backend.mail.MailService;
import com.example.backend.store.Db;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** A password sign-up can't use the app until it opens the mailed link; older accounts are left alone. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "pila.auth.verify-email=true")
class EmailVerificationTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    Db db;

    @MockitoBean
    MailService mail;

    final JsonMapper json = JsonMapper.builder().build();
    String email;
    String token;
    String userId;

    record Resp(int status, JsonNode body) {}

    Resp call(MockHttpServletRequestBuilder req, String bearer, Object body) throws Exception {
        if (bearer != null) req.header("Authorization", "Bearer " + bearer);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        MvcResult res = mvc.perform(req).andReturn();
        String text = res.getResponse().getContentAsString(StandardCharsets.UTF_8);
        return new Resp(res.getResponse().getStatus(), text.isEmpty() ? null : json.readTree(text));
    }

    /** The token from the last verification link mailed to {@link #email}. */
    String mailedLink() {
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(mail).send(eq(email), anyString(), text.capture(), anyString());
        Matcher m = Pattern.compile("/verify-email\\?token=([A-Za-z0-9_-]+)").matcher(text.getValue());
        assertThat(m.find()).isTrue();
        return m.group(1);
    }

    @BeforeEach
    void register() throws Exception {
        clearInvocations(mail);
        email = "verify-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
        Resp r = call(MockMvcRequestBuilders.post("/api/auth/register-studio"), null, Map.of("name", "新用戶", "email", email, "password", "password123", "studio", "新工作室"));
        assertThat(r.status()).isEqualTo(201);
        assertThat(r.body().get("user").get("emailVerified").asBoolean()).isFalse();
        token = r.body().get("token").asString();
        userId = r.body().get("user").get("userId").asString();
    }

    @Test
    void anUnverifiedAccountCanOnlySeeItselfUntilTheLinkIsOpened() throws Exception {
        Resp blocked = call(MockMvcRequestBuilders.get("/api/bootstrap"), token, null);
        assertThat(blocked.status()).isEqualTo(403);
        assertThat(blocked.body().get("code").asString()).isEqualTo("email_unverified");
        assertThat(call(MockMvcRequestBuilders.get("/api/auth/me"), token, null).status()).isEqualTo(200);

        Resp done = call(MockMvcRequestBuilders.post("/api/auth/verify-email"), null, Map.of("token", mailedLink()));
        assertThat(done.status()).isEqualTo(200);
        assertThat(done.body().get("user").get("emailVerified").asBoolean()).isTrue();
        assertThat(call(MockMvcRequestBuilders.get("/api/bootstrap"), done.body().get("token").asString(), null).status()).isEqualTo(200);
        assertThat(call(MockMvcRequestBuilders.get("/api/bootstrap"), token, null).status()).as("the earlier token works too").isEqualTo(200);
    }

    @Test
    void everyLinkWorksUntilItExpiresAndSignsInOnce() throws Exception {
        String first = mailedLink();
        // Within the cooldown nothing new is sent.
        clearInvocations(mail);
        assertThat(call(MockMvcRequestBuilders.post("/api/auth/verify-email/resend"), token, null).status()).isEqualTo(204);
        verify(mail, never()).send(anyString(), anyString(), anyString(), anyString());

        // Once it has passed, a new link is sent and the first one keeps working: people open the older email.
        Db.await(db.fs.collection(Db.EMAIL_VERIFICATIONS).whereEqualTo("userId", userId).get()).getDocuments()
                .forEach(d -> Db.await(d.getReference().update("createdAt", com.google.cloud.Timestamp.ofTimeSecondsAndNanos(0, 0))));
        clearInvocations(mail);
        assertThat(call(MockMvcRequestBuilders.post("/api/auth/verify-email/resend"), token, null).status()).isEqualTo(204);
        String second = mailedLink();
        assertThat(call(MockMvcRequestBuilders.post("/api/auth/verify-email"), null, Map.of("token", first)).status()).isEqualTo(200);

        // Opening a link again says it's done, and doesn't sign in a second time.
        for (String again : java.util.List.of(first, second)) {
            Resp done = call(MockMvcRequestBuilders.post("/api/auth/verify-email"), null, Map.of("token", again));
            assertThat(done.status()).isEqualTo(409);
            assertThat(done.body().get("code").asString()).isEqualTo("already_verified");
            assertThat(done.body().get("token")).isNull();
        }
    }

    @Test
    void anExpiredLinkFailsAndTheNextEmailClearsItOut() throws Exception {
        String expired = mailedLink();
        Db.await(db.fs.collection(Db.EMAIL_VERIFICATIONS).whereEqualTo("userId", userId).get()).getDocuments().forEach(d -> Db.await(d.getReference().update(
                "createdAt", com.google.cloud.Timestamp.ofTimeSecondsAndNanos(0, 0), "expiresAt", com.google.cloud.Timestamp.ofTimeSecondsAndNanos(1, 0))));
        assertThat(call(MockMvcRequestBuilders.post("/api/auth/verify-email"), null, Map.of("token", expired)).status()).isEqualTo(400);

        clearInvocations(mail);
        assertThat(call(MockMvcRequestBuilders.post("/api/auth/verify-email/resend"), token, null).status()).isEqualTo(204);
        String fresh = mailedLink();
        assertThat(Db.await(db.fs.collection(Db.EMAIL_VERIFICATIONS).whereEqualTo("userId", userId).get()).size()).isEqualTo(1);
        assertThat(call(MockMvcRequestBuilders.post("/api/auth/verify-email"), null, Map.of("token", fresh)).status()).isEqualTo(200);
    }

    @Test
    void accountsFromBeforeVerificationAreLeftAlone() throws Exception {
        Db.await(db.doc(Db.USERS, userId).update("emailVerified", null));
        assertThat(db.get(db.doc(Db.USERS, userId), UserAccount.class).orElseThrow().emailVerified).isNull();
        assertThat(call(MockMvcRequestBuilders.get("/api/bootstrap"), token, null).status()).isEqualTo(200);
    }

    @Test
    void resettingThePasswordAlsoProvesTheEmail() throws Exception {
        clearInvocations(mail);
        assertThat(call(MockMvcRequestBuilders.post("/api/auth/forgot-password"), null, Map.of("email", email)).status()).isEqualTo(204);
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(mail).send(eq(email), anyString(), text.capture(), anyString());
        Matcher m = Pattern.compile("/reset-password\\?token=([A-Za-z0-9_-]+)").matcher(text.getValue());
        assertThat(m.find()).isTrue();
        Resp done = call(MockMvcRequestBuilders.post("/api/auth/reset-password"), null, Map.of("token", m.group(1), "password", "new-password"));
        assertThat(done.body().get("user").get("emailVerified").asBoolean()).isTrue();
    }
}
