package com.example.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.backend.auth.AppleTokenVerifier.AppleUser;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
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

/** Sign in with Apple (token verification stubbed), and deleting your own account from the app. */
@SpringBootTest
@AutoConfigureMockMvc
class AccountTests {

    @Autowired
    MockMvc mvc;

    @MockitoBean
    AppleTokenVerifier apple;

    @MockitoBean
    AppleRevocation revocation;

    final JsonMapper json = JsonMapper.builder().build();
    String suffix;

    record Resp(int status, JsonNode body) {}

    Resp call(MockHttpServletRequestBuilder req, String bearer, Object body) throws Exception {
        if (bearer != null) req.header("Authorization", "Bearer " + bearer);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        MvcResult res = mvc.perform(req).andReturn();
        String text = res.getResponse().getContentAsString(StandardCharsets.UTF_8);
        return new Resp(res.getResponse().getStatus(), text.isEmpty() ? null : json.readTree(text));
    }

    Resp post(String path, String bearer, Object body) throws Exception {
        return call(MockMvcRequestBuilders.post(path), bearer, body);
    }

    Resp delete(String bearer) throws Exception {
        return call(MockMvcRequestBuilders.delete("/api/me"), bearer, null);
    }

    Resp get(String path, String bearer) throws Exception {
        return call(MockMvcRequestBuilders.get(path), bearer, null);
    }

    Resp login(String email) throws Exception {
        return post("/api/auth/login", null, Map.of("email", email, "password", "password123"));
    }

    String email(String who) {
        return who + "-" + suffix + "@example.com";
    }

    /** A studio owner signing up (the only kind of sign-up). */
    JsonNode registerStudio(String who) throws Exception {
        Resp r = post("/api/auth/register-studio", null, Map.of("name", who, "email", email(who), "password", "password123", "studio", who + " 的工作室"));
        assertThat(r.status()).isEqualTo(201);
        return r.body();
    }

    /** A student added by the coach; with {@code activate} they have also set a password. */
    String addStudent(String coachToken, String who, boolean activate) throws Exception {
        Resp added = post("/api/students", coachToken, Map.of("name", who, "email", email(who), "gender", "other", "goal", "general", "goalDetail", "", "weeklyFrequency", 2, "coachNotes", "秘密備註", "status", "active"));
        assertThat(added.status()).isEqualTo(201);
        String id = added.body().get("id").asString();
        if (activate) {
            String code = post("/api/students/" + id + "/invite", coachToken, null).body().get("inviteCode").asString();
            assertThat(post("/api/auth/activate", null, Map.of("inviteCode", code, "password", "password123")).status()).isEqualTo(200);
        }
        return id;
    }

    @BeforeEach
    void names() {
        suffix = UUID.randomUUID().toString().substring(0, 8);
    }

    // ------------------------------------------------------------------ Revoking Sign in with Apple

    String appleAccount(String sub) throws Exception {
        when(apple.verify("signup-" + sub)).thenReturn(new AppleUser(sub, email("revoke")));
        Resp r = post("/api/auth/apple", null, Map.of("identityToken", "signup-" + sub, "accountType", "studio", "studio", "蘋果工作室", "name", "蘋果"));
        assertThat(r.status()).isEqualTo(200);
        return r.body().get("token").asString();
    }

    @Test
    void onlyAccountsThatSignInWithAppleAreAskedToRevoke() throws Exception {
        when(revocation.enabled()).thenReturn(true);
        String withApple = appleAccount("apple-" + suffix);
        assertThat(get("/api/me/deletion", withApple).body().get("appleRevocation").asBoolean()).isTrue();

        String withPassword = registerStudio("plain").get("token").asString();
        assertThat(get("/api/me/deletion", withPassword).body().get("appleRevocation").asBoolean()).isFalse();

        when(revocation.enabled()).thenReturn(false);
        assertThat(get("/api/me/deletion", withApple).body().get("appleRevocation").asBoolean()).as("no key set up yet").isFalse();
    }

    @Test
    void revokingTakesThisAccountsOwnAppleToken() throws Exception {
        String sub = "apple-" + suffix;
        String token = appleAccount(sub);
        when(apple.verify("someone-else")).thenReturn(new AppleUser("apple-other-" + suffix, null));
        assertThat(post("/api/me/apple-revocation", token, Map.of("identityToken", "someone-else", "authorizationCode", "c")).status()).isEqualTo(403);
        verify(revocation, never()).revoke(anyString());

        when(apple.verify("mine")).thenReturn(new AppleUser(sub, null));
        assertThat(post("/api/me/apple-revocation", token, Map.of("identityToken", "mine", "authorizationCode", "the-code")).status()).isEqualTo(204);
        verify(revocation).revoke("the-code");
    }

    @Test
    void anAppleOutageDoesNotStopTheDeletion() throws Exception {
        String sub = "apple-" + suffix;
        String token = appleAccount(sub);
        when(apple.verify("mine")).thenReturn(new AppleUser(sub, null));
        doThrow(new java.io.IOException("down")).when(revocation).revoke(anyString());
        assertThat(post("/api/me/apple-revocation", token, Map.of("identityToken", "mine", "authorizationCode", "c")).status()).isEqualTo(204);
        assertThat(delete(token).status()).isEqualTo(204);
    }

    // ------------------------------------------------------------------ Sign in with Apple

    @Test
    void aNewAppleUserSignsUpTheirStudioThenSignsInWithoutAnEmail() throws Exception {
        String sub = "apple-" + suffix;
        when(apple.verify("first")).thenReturn(new AppleUser(sub, email("apple")));
        Resp needsType = post("/api/auth/apple", null, Map.of("identityToken", "first"));
        assertThat(needsType.status()).isEqualTo(409);
        assertThat(needsType.body().get("code").asString()).isEqualTo("signup_required");

        assertThat(post("/api/auth/apple", null, Map.of("identityToken", "first", "accountType", "self", "name", "蘋果")).status())
                .as("only studios sign up").isEqualTo(400);
        assertThat(post("/api/auth/apple", null, Map.of("identityToken", "first", "accountType", "studio", "name", "蘋果")).status())
                .as("a studio needs its name").isEqualTo(400);
        Resp created = post("/api/auth/apple", null, Map.of("identityToken", "first", "accountType", "studio", "studio", "蘋果工作室", "name", "蘋果"));
        assertThat(created.status()).isEqualTo(200);
        assertThat(created.body().get("user").get("role").asString()).isEqualTo("owner");
        assertThat(created.body().get("user").get("name").asString()).isEqualTo("蘋果");
        assertThat(created.body().get("user").get("emailVerified").asBoolean()).isTrue();

        // Apple usually leaves the email out after the first time.
        when(apple.verify("later")).thenReturn(new AppleUser(sub, null));
        Resp again = post("/api/auth/apple", null, Map.of("identityToken", "later"));
        assertThat(again.status()).isEqualTo(200);
        assertThat(again.body().get("user").get("userId").asString()).isEqualTo(created.body().get("user").get("userId").asString());

        when(apple.verify("unknown")).thenReturn(new AppleUser("apple-other-" + suffix, null));
        assertThat(post("/api/auth/apple", null, Map.of("identityToken", "unknown", "accountType", "studio", "studio", "x")).status()).as("nothing to make an account from").isEqualTo(400);
    }

    @Test
    void appleLinksAnAccountWithTheSameEmail() throws Exception {
        JsonNode existing = registerStudio("linked");
        when(apple.verify("t")).thenReturn(new AppleUser("apple-" + suffix, email("linked")));
        Resp signedIn = post("/api/auth/apple", null, Map.of("identityToken", "t"));
        assertThat(signedIn.status()).isEqualTo(200);
        assertThat(signedIn.body().get("user").get("userId").asString()).isEqualTo(existing.get("user").get("userId").asString());
        assertThat(login(email("linked")).status()).as("the unproven password stops working (see AuthService)").isEqualTo(401);
    }

    // ------------------------------------------------------------------ deleting an account

    @Test
    void aStudentsRecordStaysWithTheStudioWithNothingPersonal() throws Exception {
        String coach = registerStudio("coach").get("token").asString();
        String id = addStudent(coach, "student", true);
        String student = login(email("student")).body().get("token").asString();

        assertThat(delete(student).status()).isEqualTo(204);
        assertThat(login(email("student")).status()).isEqualTo(401);

        JsonNode record = get("/api/students/" + id, coach).body();
        assertThat(record.get("name").asString()).isEqualTo("已刪除帳號的學員");
        assertThat(record.get("email").asString()).isEmpty();
        assertThat(record.get("status").asString()).isEqualTo("inactive");
        assertThat(record.get("coachNotes").asString()).isEmpty();
    }

    @Test
    void anOwnerDeletesTheWholeStudioStudentsSignInsIncluded() throws Exception {
        String owner = registerStudio("owner").get("token").asString();
        addStudent(owner, "active", true);
        addStudent(owner, "neversignedin", false);

        assertThat(delete(owner).status()).isEqualTo(204);
        assertThat(login(email("owner")).status()).isEqualTo(401);
        assertThat(login(email("active")).status()).as("no account outside a studio").isEqualTo(401);
        // Every address is free again.
        registerStudio("active");
        registerStudio("neversignedin");
    }

    @Test
    void aStudioWithOtherCoachesMustRemoveThemFirst_andACoachsStudentsGoToTheOwner() throws Exception {
        String owner = registerStudio("owner").get("token").asString();
        Resp invited = post("/api/studio/coaches", owner, Map.of("name", "教練", "email", email("member")));
        assertThat(invited.status()).isEqualTo(201);
        String code = invited.body().get("inviteCode").asString();
        Resp coach = post("/api/auth/activate", null, Map.of("inviteCode", code, "password", "password123"));
        String coachToken = coach.body().get("token").asString();
        String coachId = coach.body().get("user").get("userId").asString();
        Map<String, Object> student = new HashMap<>(Map.of("name", "學員", "email", email("theirs"), "gender", "other", "goal", "general", "goalDetail", "", "weeklyFrequency", 2, "coachNotes", "", "status", "active"));
        student.put("coachId", coachId);
        String studentId = post("/api/students", owner, student).body().get("id").asString();

        Resp refused = delete(owner);
        assertThat(refused.status()).isEqualTo(409);
        assertThat(refused.body().get("code").asString()).isEqualTo("studio_has_coaches");

        assertThat(delete(coachToken).status()).isEqualTo(204);
        assertThat(login(email("member")).status()).isEqualTo(401);
        JsonNode rel = get("/api/bootstrap", owner).body().get("relationships");
        boolean toOwner = false;
        for (JsonNode r : rel) if (studentId.equals(r.get("studentId").asString())) toOwner = !coachId.equals(r.get("coachId").asString());
        assertThat(toOwner).as("the student went to the owner").isTrue();

        assertThat(delete(owner).status()).as("no other coaches left").isEqualTo(204);
        assertThat(login(email("owner")).status()).isEqualTo(401);
    }
}
