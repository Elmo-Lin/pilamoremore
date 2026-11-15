package com.example.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;
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

/** Cardio is one entry per activity: time, and optionally distance, heart rate and calories. */
@SpringBootTest
@AutoConfigureMockMvc
class CardioTests {

    @Autowired
    MockMvc mvc;

    final JsonMapper json = JsonMapper.builder().build();

    record Resp(int status, JsonNode body) {}

    Resp call(MockHttpServletRequestBuilder req, String bearer, Object body) throws Exception {
        if (bearer != null) req.header("Authorization", "Bearer " + bearer);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        MvcResult res = mvc.perform(req).andReturn();
        String text = res.getResponse().getContentAsString(StandardCharsets.UTF_8);
        return new Resp(res.getResponse().getStatus(), text.isEmpty() ? null : json.readTree(text));
    }

    Map<String, Object> workout(String studentId, Map<String, Object> set) {
        return Map.of("studentId", studentId, "type", "independent", "status", "completed", "title", "河堤快走", "startedAt", "2026-10-27T06:00:00Z",
                "exercises", List.of(Map.of("exerciseId", "px_walk", "sets", List.of(set))), "notes", "");
    }

    @Test
    void aWalkIsSavedWithItsTimeAndDistance() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        String owner = call(MockMvcRequestBuilders.post("/api/auth/register-studio"), null,
                Map.of("name", "老師", "email", "cardio-" + tag + "@example.com", "password", "password123", "studio", "有氧工作室")).body().get("token").asString();
        String id = call(MockMvcRequestBuilders.post("/api/students"), owner, Map.of("name", "快走者", "email", "walker-" + tag + "@example.com",
                "gender", "female", "goal", "general", "weeklyFrequency", 2, "status", "active")).body().get("id").asString();
        String code = call(MockMvcRequestBuilders.post("/api/students/" + id + "/invite"), owner, null).body().get("inviteCode").asString();
        String token = call(MockMvcRequestBuilders.post("/api/auth/activate"), null, Map.of("inviteCode", code, "password", "student123")).body().get("token").asString();

        Map<String, Object> walk = Map.of("id", "set_walk1", "completed", true, "durationSec", 1800, "distanceKm", 5.2, "avgHeartRate", 152, "calories", 340);
        assertThat(call(MockMvcRequestBuilders.put("/api/workouts/wo_walk1"), token, workout(id, walk)).status()).isEqualTo(200);

        JsonNode set = call(MockMvcRequestBuilders.get("/api/bootstrap"), token, null).body().get("workouts").get(0).get("exercises").get(0).get("sets").get(0);
        assertThat(set.get("durationSec").asInt()).isEqualTo(1800);
        assertThat(set.get("distanceKm").asDouble()).isEqualTo(5.2);
        assertThat(set.get("avgHeartRate").asInt()).isEqualTo(152);
        assertThat(set.get("calories").asInt()).isEqualTo(340);
        assertThat(set.has("springs") || set.has("weightKg")).as("no springs or weight on a walk").isFalse();

        Map<String, Object> empty = Map.of("id", "set_walk2", "completed", true);
        Resp refused = call(MockMvcRequestBuilders.put("/api/workouts/wo_walk2"), token, workout(id, empty));
        assertThat(refused.status()).isEqualTo(400);
        assertThat(refused.body().get("message").asString()).contains("時間");
    }
}
