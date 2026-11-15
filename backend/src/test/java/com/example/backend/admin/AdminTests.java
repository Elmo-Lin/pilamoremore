package com.example.backend.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.backend.store.Db;
import com.google.cloud.Timestamp;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Only the configured owner, with a proven email, sees the admin page; 永久版 never lapses and never asks to pay. */
@SpringBootTest
@AutoConfigureMockMvc
class AdminTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    Db db;

    final JsonMapper json = JsonMapper.builder().build();

    record Resp(int status, JsonNode body) {}

    Resp call(MockHttpServletRequestBuilder req, String token, Object body) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        MvcResult res = mvc.perform(req).andReturn();
        String text = res.getResponse().getContentAsString(StandardCharsets.UTF_8);
        return new Resp(res.getResponse().getStatus(), text.isEmpty() ? null : json.readTree(text));
    }

    String[] register(String email) throws Exception {
        Resp r = call(MockMvcRequestBuilders.post("/api/auth/register-studio"), null, Map.of("name", "測試", "email", email, "password", "password123", "studio", "測試工作室"));
        assertThat(r.status()).isEqualTo(201);
        return new String[] {r.body().get("token").asString(), r.body().get("user").get("userId").asString()};
    }

    @Test
    void onlyTheOwnerWithAProvenEmailGetsIn() throws Exception {
        String[] boss = existingOrNew("boss@example.com");
        String[] friend = register("friend-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com");
        assertThat(call(MockMvcRequestBuilders.get("/api/admin/overview"), friend[0], null).status()).as("not there for anyone else").isEqualTo(404);
        assertThat(call(MockMvcRequestBuilders.get("/api/admin/status"), friend[0], null).body().get("admin").asBoolean()).isFalse();

        db.update(db.doc(Db.USERS, boss[1]), "emailVerified", null);
        assertThat(call(MockMvcRequestBuilders.get("/api/admin/overview"), boss[0], null).status()).as("registering the email isn't enough").isEqualTo(404);
        db.update(db.doc(Db.USERS, boss[1]), "googleSub", "google-boss"); // linked Google before emailVerified existed
        assertThat(call(MockMvcRequestBuilders.get("/api/admin/status"), boss[0], null).body().get("admin").asBoolean()).isTrue();
        db.update(db.doc(Db.USERS, boss[1]), "googleSub", null);
        db.update(db.doc(Db.USERS, boss[1]), "emailVerified", true); // or reset the password from a mailed link
        assertThat(call(MockMvcRequestBuilders.get("/api/admin/status"), boss[0], null).body().get("admin").asBoolean()).isTrue();
        JsonNode overview = call(MockMvcRequestBuilders.get("/api/admin/overview"), boss[0], null).body();
        assertThat(overview.get("users").asLong()).isGreaterThanOrEqualTo(2);
        assertThat(overview.get("workspaces").toString()).contains(friend[1]);
    }

    @Test
    void theUserListShowsWhoUsesTheAppButOnlyToTheOwner() throws Exception {
        String[] boss = existingOrNew("boss@example.com");
        db.update(db.doc(Db.USERS, boss[1]), "emailVerified", true);
        String[] coach = register("user-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com");
        assertThat(call(MockMvcRequestBuilders.get("/api/admin/users"), coach[0], null).status()).as("not there for anyone else").isEqualTo(404);

        call(MockMvcRequestBuilders.get("/api/bootstrap"), coach[0], null); // opening the app marks them as seen
        JsonNode users = call(MockMvcRequestBuilders.get("/api/admin/users"), boss[0], null).body();
        JsonNode row = null;
        for (JsonNode u : users) if (coach[1].equals(u.get("id").asString())) row = u;
        assertThat(row).isNotNull();
        assertThat(row.get("kind").asString()).as("everyone who signs up runs a studio").isEqualTo("owner");
        assertThat(row.get("login").asString()).isEqualTo("password");
        assertThat(row.get("students").asLong()).isZero();
        assertThat(row.has("passwordHash")).as("no secrets").isFalse();
        Thread.sleep(500); // the last-seen write isn't awaited
        JsonNode again = call(MockMvcRequestBuilders.get("/api/admin/users"), boss[0], null).body();
        for (JsonNode u : again) if (coach[1].equals(u.get("id").asString())) assertThat(u.has("lastSeenAt")).isTrue();
    }

    @Test
    void complimentaryWorkspacesNeverLapseNorPay() throws Exception {
        String[] boss = existingOrNew("boss@example.com");
        db.update(db.doc(Db.USERS, boss[1]), "emailVerified", true);
        String[] friend = register("pal-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com");
        // Their trial is long over.
        db.update(db.doc(Db.COACHES, friend[1]), "subscription.trialEndsAt", Timestamp.ofTimeSecondsAndNanos(Instant.now().minusSeconds(86400).getEpochSecond(), 0));
        assertThat(call(MockMvcRequestBuilders.get("/api/bootstrap"), friend[0], null).body().get("billing").get("status").asString()).isEqualTo("expired");

        assertThat(call(MockMvcRequestBuilders.put("/api/admin/workspaces/" + friend[1] + "/complimentary"), friend[0],
                Map.of("extraStudentPacks", 2, "extraCoachSeats", 0)).status()).as("only the admin grants it").isEqualTo(404);
        assertThat(call(MockMvcRequestBuilders.put("/api/admin/workspaces/" + friend[1] + "/complimentary"), boss[0],
                Map.of("extraStudentPacks", 2, "extraCoachSeats", 0)).status()).isEqualTo(204);
        JsonNode billing = call(MockMvcRequestBuilders.get("/api/bootstrap"), friend[0], null).body().get("billing");
        assertThat(billing.get("status").asString()).isEqualTo("complimentary");
        assertThat(call(MockMvcRequestBuilders.post("/api/students"), friend[0], Map.of("name", "好友的學員", "email", "s-" + friend[1] + "@example.com",
                "gender", "female", "goal", "core", "weeklyFrequency", 2, "status", "active")).status()).as("writable again").isEqualTo(201);
        Resp pay = call(MockMvcRequestBuilders.post("/api/billing/subscribe"), friend[0], Map.of("extraStudentPacks", 0, "extraCoachSeats", 0));
        assertThat(pay.body().get("code").asString()).isEqualTo("complimentary");

        assertThat(call(MockMvcRequestBuilders.delete("/api/admin/workspaces/" + friend[1] + "/complimentary"), boss[0], null).status()).isEqualTo(204);
        assertThat(call(MockMvcRequestBuilders.get("/api/bootstrap"), friend[0], null).body().get("billing").get("status").asString())
                .as("a week to subscribe").isEqualTo("canceled");
    }

    /** Both tests sign in as the one admin email. */
    String[] existingOrNew(String email) throws Exception {
        Resp login = call(MockMvcRequestBuilders.post("/api/auth/login"), null, Map.of("email", email, "password", "password123"));
        if (login.status() == 200) return new String[] {login.body().get("token").asString(), login.body().get("user").get("userId").asString()};
        return register(email);
    }
}
