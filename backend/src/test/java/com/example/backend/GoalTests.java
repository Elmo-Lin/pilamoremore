package com.example.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
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

/** Training goals belong to the person who set them. */
@SpringBootTest
@AutoConfigureMockMvc
class GoalTests {

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

    /** A studio owner's token, and with {@code student} a student of theirs who has activated. */
    String[] studioAndStudent() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        String owner = call(MockMvcRequestBuilders.post("/api/auth/register-studio"), null,
                Map.of("name", "目標", "email", "goal-" + tag + "@example.com", "password", "password123", "studio", "目標工作室")).body().get("token").asString();
        String sid = call(MockMvcRequestBuilders.post("/api/students"), owner, Map.of("name", "小美", "email", "goal-stu-" + tag + "@example.com",
                "gender", "female", "goal", "core", "weeklyFrequency", 2, "status", "active")).body().get("id").asString();
        String code = call(MockMvcRequestBuilders.post("/api/students/" + sid + "/invite"), owner, null).body().get("inviteCode").asString();
        String student = call(MockMvcRequestBuilders.post("/api/auth/activate"), null, Map.of("inviteCode", code, "password", "student123")).body().get("token").asString();
        return new String[] {owner, student};
    }

    @Test
    void aStudentSetsAndRemovesTheirOwnGoalsInReps() throws Exception {
        String me = studioAndStudent()[1];
        Map<String, Object> goal = Map.of("exerciseId", "px_teaser", "targetReps", 10, "deadline", "2026-12-31T00:00:00Z");
        Resp saved = call(MockMvcRequestBuilders.put("/api/goals/goal_test1"), me, goal);
        assertThat(saved.status()).as(String.valueOf(saved.body())).isEqualTo(200);
        assertThat(saved.body().get("targetReps").asInt()).isEqualTo(10);

        JsonNode goals = call(MockMvcRequestBuilders.get("/api/bootstrap"), me, null).body().get("goals");
        assertThat(goals).hasSize(1);
        assertThat(goals.get(0).get("exerciseId").asString()).isEqualTo("px_teaser");

        assertThat(call(MockMvcRequestBuilders.put("/api/goals/goal_test2"), me, Map.of("exerciseId", "px_nope", "targetReps", 5)).status()).isEqualTo(400);
        assertThat(call(MockMvcRequestBuilders.put("/api/goals/goal_test3"), me, Map.of("exerciseId", "px_rollup", "targetReps", 0)).status()).isEqualTo(400);
        assertThat(call(MockMvcRequestBuilders.put("/api/goals/goal_test4"), me, Map.of("exerciseId", "px_rollup", "targetReps", 201)).status()).isEqualTo(400);

        assertThat(call(MockMvcRequestBuilders.delete("/api/goals/goal_test1"), me, null).status()).isEqualTo(204);
        assertThat(call(MockMvcRequestBuilders.get("/api/bootstrap"), me, null).body().get("goals")).isEmpty();
    }

    @Test
    void teachersDoNotSetGoals() throws Exception {
        String owner = studioAndStudent()[0];
        assertThat(call(MockMvcRequestBuilders.put("/api/goals/goal_c"), owner, Map.of("exerciseId", "px_teaser", "targetReps", 10)).status()).isEqualTo(403);
    }
}
