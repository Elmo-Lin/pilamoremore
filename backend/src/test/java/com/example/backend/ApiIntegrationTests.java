package com.example.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * End-to-end API tests over HTTP (MockMvc) against the Firestore emulator (see scripts/test.sh).
 * Every account is in a studio: {@code coach} is a studio owner (who teaches too).
 */
@SpringBootTest
@AutoConfigureMockMvc
class ApiIntegrationTests {

    @Autowired
    MockMvc mvc;

    final JsonMapper json = JsonMapper.builder().build();

    String coach;
    String coachId;
    String suffix;

    record Resp(int status, JsonNode body) {}

    @BeforeEach
    void registerOwner() throws Exception {
        suffix = UUID.randomUUID().toString().substring(0, 8);
        Resp r = call(post("/api/auth/register-studio"), null,
                Map.of("name", "測試老師", "email", "coach-" + suffix + "@example.com", "password", "password123", "studio", "光合皮拉提斯"));
        assertThat(r.status()).isEqualTo(201);
        coach = r.body().get("token").asString();
        coachId = r.body().get("user").get("userId").asString();
    }

    // ------------------------------------------------------------------ helpers

    Resp call(MockHttpServletRequestBuilder req, String token, Object body) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        MvcResult res = mvc.perform(req).andReturn();
        String text = res.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return new Resp(res.getResponse().getStatus(), text.isEmpty() ? null : json.readTree(text));
    }

    /** Another studio, owned by someone else. */
    String otherStudio(String tag) throws Exception {
        Resp r = call(post("/api/auth/register-studio"), null,
                Map.of("name", "別的老師", "email", tag + "-" + suffix + "@example.com", "password", "password123", "studio", "別的工作室"));
        assertThat(r.status()).isEqualTo(201);
        return r.body().get("token").asString();
    }

    String createStudent(String token, String name) throws Exception {
        Resp r = call(post("/api/students"), token, Map.of(
                "name", name, "email", name + "-" + suffix + "@example.com", "gender", "female", "goal", "core",
                "weeklyFrequency", 2, "status", "active", "coachNotes", "私密備註"));
        assertThat(r.status()).as(String.valueOf(r.body())).isEqualTo(201);
        return r.body().get("id").asString();
    }

    /** A Pilates session: footwork on the reformer, three red springs, ten reps. */
    Map<String, Object> workout(String studentId, String type, String status) {
        return Map.of(
                "studentId", studentId, "type", type, "status", status, "title", "核心床基礎",
                "startedAt", Instant.now().toString(), "notes", "",
                "exercises", List.of(Map.of("id", "el_1", "exerciseId", "px_footwork",
                        "sets", List.of(Map.of("id", "set_1", "springs", "3紅", "reps", 10, "completed", true)))));
    }

    String saveWorkout(String token, String studentId, String type) throws Exception {
        String id = "wo_" + UUID.randomUUID().toString().substring(0, 10);
        Resp r = call(put("/api/workouts/" + id), token, workout(studentId, type, "completed"));
        assertThat(r.status()).as(String.valueOf(r.body())).isEqualTo(200);
        return id;
    }

    String addPackage(String token, String studentId, int sessions) throws Exception {
        Resp r = call(post("/api/students/" + studentId + "/packages"), token,
                Map.of("name", sessions + " 堂", "totalSessions", sessions, "priceTwd", 20000, "purchaseDate", Instant.now().minusSeconds(3600).toString()));
        assertThat(r.status()).as(String.valueOf(r.body())).isEqualTo(201);
        return r.body().get("id").asString();
    }

    int remaining(String token, String studentId) throws Exception {
        return call(get("/api/students/" + studentId + "/balance"), token, null).body().get("remaining").asInt();
    }

    String studentToken(String studentId) throws Exception {
        String code = call(post("/api/students/" + studentId + "/invite"), coach, null).body().get("inviteCode").asString();
        Resp r = call(post("/api/auth/activate"), null, Map.of("inviteCode", code, "password", "student123"));
        assertThat(r.status()).isEqualTo(200);
        return r.body().get("token").asString();
    }

    // ------------------------------------------------------------------ tests

    @Test
    void requiresAuthentication() throws Exception {
        assertThat(call(get("/api/bootstrap"), null, null).status()).isEqualTo(401);
        assertThat(call(get("/api/bootstrap"), "not-a-token", null).status()).isEqualTo(401);
        assertThat(call(get("/api/health"), null, null).status()).isEqualTo(200);
    }

    @Test
    void onlyStudiosSignUp() throws Exception {
        Map<String, Object> person = Map.of("name", "X", "email", "x-" + suffix + "@example.com", "password", "password123");
        assertThat(call(post("/api/auth/register"), null, person).status()).as("no free-teacher sign-up").isNotEqualTo(201);
        assertThat(call(post("/api/auth/register-self"), null, person).status()).as("no self-practice sign-up").isNotEqualTo(201);
        assertThat(call(post("/api/auth/register-studio"), null, Map.of("name", "X", "email", "y-" + suffix + "@example.com", "password", "password123")).status())
                .as("a studio needs its name").isEqualTo(400);

        JsonNode boot = call(get("/api/bootstrap"), coach, null).body();
        assertThat(boot.get("studio").get("kind").asString()).isEqualTo("studio");
        assertThat(boot.get("studio").get("name").asString()).isEqualTo("光合皮拉提斯");
        assertThat(boot.has("plans")).as("no training plans").isFalse();
        assertThat(call(get("/api/plans"), coach, null).status()).isIn(404, 405);
    }

    @Test
    void loginRejectsWrongPasswordWithoutRevealingAccounts() throws Exception {
        Resp wrong = call(post("/api/auth/login"), null, Map.of("email", "coach-" + suffix + "@example.com", "password", "nope-nope"));
        Resp unknown = call(post("/api/auth/login"), null, Map.of("email", "ghost-" + suffix + "@example.com", "password", "nope-nope"));
        assertThat(wrong.status()).isEqualTo(401);
        assertThat(unknown.status()).isEqualTo(401);
        assertThat(wrong.body().get("message").asString()).isEqualTo(unknown.body().get("message").asString());
        assertThat(call(post("/api/auth/login"), null, Map.of("email", "COACH-" + suffix + "@example.com", "password", "password123")).status())
                .as("email is case-insensitive").isEqualTo(200);
    }

    @Test
    void validatesStudentInput() throws Exception {
        Resp r = call(post("/api/students"), coach, Map.of("name", "", "email", "bad", "gender", "female", "goal", "core",
                "weeklyFrequency", 2, "status", "active"));
        assertThat(r.status()).isEqualTo(400);
        Resp dup = call(post("/api/students"), coach, Map.of("name", "X", "email", "coach-" + suffix + "@example.com", "gender", "female",
                "goal", "core", "weeklyFrequency", 2, "status", "active"));
        assertThat(dup.status()).isEqualTo(409);
        assertThat(call(post("/api/students"), coach, Map.of("name", "X", "email", "z-" + suffix + "@example.com", "gender", "female",
                "goal", "strength", "weeklyFrequency", 2, "status", "active")).status()).as("Pilates goals only").isEqualTo(400);
    }

    @Test
    void studiosCannotSeeEachOthersStudents() throws Exception {
        String sid = createStudent(coach, "amy");
        String other = otherStudio("other");
        assertThat(call(get("/api/students/" + sid), other, null).status()).isEqualTo(404);
        assertThat(call(put("/api/workouts/wo_x" + suffix), other, workout(sid, "coached", "completed")).status()).isEqualTo(404);
        assertThat(call(get("/api/bootstrap"), other, null).body().get("students").size()).isZero();
    }

    @Test
    void setsKeepTheirSpringsAndReps() throws Exception {
        String sid = createStudent(coach, "spr");
        String id = "wo_spr" + suffix;
        Map<String, Object> session = new java.util.HashMap<>(workout(sid, "coached", "completed"));
        session.put("exercises", List.of(
                Map.of("id", "el_r", "exerciseId", "px_longstretch",
                        "sets", List.of(Map.of("id", "set_r", "springs", " 1紅1藍 ", "reps", 6, "completed", true))),
                Map.of("id", "el_m", "exerciseId", "px_teaser",
                        "sets", List.of(Map.of("id", "set_m", "reps", 5, "completed", true))),
                Map.of("id", "el_j", "exerciseId", "px_jumpboard",
                        "sets", List.of(Map.of("id", "set_j", "durationSec", 300, "completed", true)))));
        Resp r = call(put("/api/workouts/" + id), coach, session);
        assertThat(r.status()).as(String.valueOf(r.body())).isEqualTo(200);
        JsonNode saved = call(get("/api/workouts/" + id), coach, null).body().get("exercises");
        assertThat(saved.get(0).get("sets").get(0).get("springs").asString()).as("trimmed, as written").isEqualTo("1紅1藍");
        assertThat(saved.get(0).get("sets").get(0).get("reps").asInt()).isEqualTo(6);
        assertThat(saved.get(1).get("sets").get(0).has("springs")).as("off the springs on the mat").isFalse();
        assertThat(saved.get(2).get("sets").get(0).get("durationSec").asInt()).as("the jump board is timed").isEqualTo(300);

        Map<String, Object> tooLong = new java.util.HashMap<>(workout(sid, "coached", "completed"));
        tooLong.put("exercises", List.of(Map.of("id", "el_x", "exerciseId", "px_footwork",
                "sets", List.of(Map.of("id", "set_x", "springs", "x".repeat(21), "reps", 10, "completed", true)))));
        assertThat(call(put("/api/workouts/wo_long" + suffix), coach, tooLong).status()).isEqualTo(400);
        Map<String, Object> noReps = new java.util.HashMap<>(workout(sid, "coached", "completed"));
        noReps.put("exercises", List.of(Map.of("id", "el_y", "exerciseId", "px_footwork",
                "sets", List.of(Map.of("id", "set_y", "springs", "3紅", "completed", true)))));
        assertThat(call(put("/api/workouts/wo_noreps" + suffix), coach, noReps).status()).as("a done set needs its reps").isEqualTo(400);
    }

    @Test
    void deductionIsExplicitSingleAndReversible() throws Exception {
        String sid = createStudent(coach, "bob");
        String wo = saveWorkout(coach, sid, "coached");

        assertThat(call(post("/api/workouts/" + wo + "/deduction"), coach, null).body().get("code").asString())
                .as("no package yet").isEqualTo("no_balance");

        addPackage(coach, sid, 10);
        assertThat(remaining(coach, sid)).as("saving a session never deducts").isEqualTo(10);

        Resp d = call(post("/api/workouts/" + wo + "/deduction"), coach, Map.of("transactionId", "tx_client1" + suffix));
        assertThat(d.status()).isEqualTo(201);
        assertThat(d.body().get("transaction").get("id").asString()).as("client-provided id kept").isEqualTo("tx_client1" + suffix);
        assertThat(d.body().get("balance").get("remaining").asInt()).isEqualTo(9);

        assertThat(call(post("/api/workouts/" + wo + "/deduction"), coach, null).body().get("code").asString()).isEqualTo("already_deducted");
        assertThat(call(delete("/api/workouts/" + wo), coach, null).status()).as("cannot delete a billed session").isEqualTo(409);
        assertThat(call(put("/api/workouts/" + wo), coach, workout(sid, "independent", "completed")).status())
                .as("cannot turn a billed session into practice at home").isEqualTo(409);

        assertThat(call(post("/api/workouts/" + wo + "/deduction/reversal"), coach, Map.of("reason", "")).status()).isEqualTo(400);
        Resp rev = call(post("/api/workouts/" + wo + "/deduction/reversal"), coach, Map.of("reason", "誤扣"));
        assertThat(rev.body().get("balance").get("remaining").asInt()).isEqualTo(10);
        assertThat(call(post("/api/workouts/" + wo + "/deduction"), coach, null).status()).as("can deduct again after reversal").isEqualTo(201);

        JsonNode txs = call(get("/api/students/" + sid + "/transactions"), coach, null).body();
        assertThat(txs.size()).as("history is append-only").isEqualTo(3);
    }

    @Test
    void independentAndDraftWorkoutsCannotBeDeducted() throws Exception {
        String sid = createStudent(coach, "cat");
        addPackage(coach, sid, 5);
        String indep = saveWorkout(coach, sid, "independent");
        assertThat(call(post("/api/workouts/" + indep + "/deduction"), coach, null).body().get("code").asString()).isEqualTo("independent_workout");

        String draft = "wo_draft" + suffix;
        call(put("/api/workouts/" + draft), coach, workout(sid, "coached", "draft"));
        assertThat(call(post("/api/workouts/" + draft + "/deduction"), coach, null).body().get("code").asString()).isEqualTo("not_completed");
        assertThat(remaining(coach, sid)).isEqualTo(5);
    }

    @Test
    void balanceCanNeverGoNegative() throws Exception {
        String sid = createStudent(coach, "dan");
        String pkg = addPackage(coach, sid, 2);
        assertThat(call(post("/api/packages/" + pkg + "/adjustments"), coach, Map.of("delta", -3, "reason", "測試")).body().get("code").asString())
                .isEqualTo("negative_balance");
        assertThat(call(post("/api/packages/" + pkg + "/adjustments"), coach, Map.of("delta", -1, "reason", "")).status()).isEqualTo(400);
        assertThat(call(post("/api/packages/" + pkg + "/adjustments"), coach, Map.of("delta", -2, "reason", "未到課")).status()).isEqualTo(201);
        assertThat(remaining(coach, sid)).isZero();

        String wo = saveWorkout(coach, sid, "coached");
        assertThat(call(post("/api/workouts/" + wo + "/deduction"), coach, null).body().get("code").asString()).isEqualTo("no_balance");
        assertThat(call(put("/api/packages/" + pkg), coach, Map.of("name", "x", "totalSessions", 1, "priceTwd", 0,
                "purchaseDate", Instant.now().toString())).status()).as("total cannot drop below what is consumed").isEqualTo(409);
        assertThat(call(delete("/api/packages/" + pkg), coach, null).status()).as("package with history cannot be deleted").isEqualTo(409);
    }

    @Test
    void teachersKeepTheirOwnPackagePresets() throws Exception {
        assertThat(call(get("/api/bootstrap"), coach, null).body().get("coach").has("packagePresets")).as("unset until customized").isFalse();
        var presets = Map.of("presets", List.of(Map.of("name", " 8 堂體驗 ", "totalSessions", 8, "priceTwd", 12000)));
        Resp r = call(put("/api/me/package-presets"), coach, presets);
        assertThat(r.status()).as(String.valueOf(r.body())).isEqualTo(200);
        JsonNode saved = call(get("/api/bootstrap"), coach, null).body().get("coach").get("packagePresets");
        assertThat(saved.size()).isEqualTo(1);
        assertThat(saved.get(0).get("name").asString()).isEqualTo("8 堂體驗");
        assertThat(saved.get(0).get("priceTwd").asInt()).isEqualTo(12000);

        assertThat(call(put("/api/me/package-presets"), coach, Map.of("presets", List.of(Map.of("name", "x", "totalSessions", 0, "priceTwd", 0)))).status())
                .isEqualTo(400);
        assertThat(call(put("/api/me/package-presets"), coach, Map.of("presets", List.of())).status()).isEqualTo(200);
        assertThat(call(get("/api/bootstrap"), coach, null).body().get("coach").get("packagePresets").size()).as("empty list is kept").isZero();

        String student = studentToken(createStudent(coach, "pia"));
        assertThat(call(put("/api/me/package-presets"), student, presets).status()).isEqualTo(403);
        assertThat(call(get("/api/bootstrap"), student, null).body().get("coach").has("packagePresets")).as("never shown to students").isFalse();
    }

    @Test
    void studiosAddCustomMovesForThemselves() throws Exception {
        JsonNode catalog = call(get("/api/exercises"), coach, null).body();
        assertThat(catalog.size()).as("the built-in Pilates repertoire").isGreaterThanOrEqualTo(60);
        assertThat(catalog.toString()).contains("px_footwork").contains("\"equipment\":\"reformer\"").doesNotContain("\"increment\"");

        Map<String, Object> input = Map.of("id", "cex_ring" + suffix, "name", "魔術圈側躺內收", "nameEn", "Side-lying Ring Squeeze", "muscleGroup", "legs", "equipment", "props");
        Resp created = call(post("/api/exercises"), coach, input);
        assertThat(created.status()).as(String.valueOf(created.body())).isEqualTo(201);
        assertThat(created.body().get("custom").asBoolean()).isTrue();
        assertThat(call(post("/api/exercises"), coach, Map.of("name", "魔術圈側躺內收", "muscleGroup", "legs", "equipment", "props")).status())
                .as("same name twice").isEqualTo(409);
        assertThat(call(post("/api/exercises"), coach, Map.of("name", "腳步運動", "muscleGroup", "legs", "equipment", "reformer")).status())
                .as("a built-in name").isEqualTo(409);
        assertThat(call(post("/api/exercises"), coach, Map.of("name", "X", "muscleGroup", "neck", "equipment", "props")).status()).isEqualTo(400);
        assertThat(call(post("/api/exercises"), coach, Map.of("name", "X", "muscleGroup", "legs", "equipment", "barbell")).status())
                .as("Pilates apparatus only").isEqualTo(400);

        String sid = createStudent(coach, "cex");
        Map<String, Object> session = Map.of("studentId", sid, "type", "coached", "status", "completed", "title", "A",
                "startedAt", Instant.now().toString(), "notes", "",
                "exercises", List.of(Map.of("id", "el_1", "exerciseId", "cex_ring" + suffix,
                        "sets", List.of(Map.of("id", "set_1", "reps", 10, "completed", true)))));
        assertThat(call(put("/api/workouts/wo_cex" + suffix), coach, session).status()).isEqualTo(200);

        String student = studentToken(sid);
        assertThat(call(get("/api/bootstrap"), student, null).body().get("exercises").toString()).as("students see them").contains("魔術圈側躺內收");
        assertThat(call(post("/api/exercises"), student, Map.of("name", "學員動作", "muscleGroup", "core", "equipment", "mat")).status()).isEqualTo(403);

        String other = otherStudio("cexo");
        assertThat(call(get("/api/bootstrap"), other, null).body().get("exercises").toString()).as("other studios do not").doesNotContain("魔術圈側躺內收");

        assertThat(call(put("/api/exercises/cex_ring" + suffix), coach, Map.of("name", "魔術圈側躺內收（進階）", "muscleGroup", "legs", "equipment", "props")).status()).isEqualTo(200);
        assertThat(call(put("/api/exercises/px_footwork"), coach, Map.of("name", "改名", "muscleGroup", "legs", "equipment", "reformer")).status())
                .as("built-ins cannot be edited").isEqualTo(404);
        assertThat(call(delete("/api/exercises/cex_ring" + suffix), coach, null).status()).isEqualTo(204);
        JsonNode archived = null;
        for (JsonNode e : call(get("/api/bootstrap"), coach, null).body().get("exercises")) if (e.get("id").asString().equals("cex_ring" + suffix)) archived = e;
        assertThat(archived).as("kept for history").isNotNull();
        assertThat(archived.get("archived").asBoolean()).isTrue();
        assertThat(call(post("/api/exercises"), coach, Map.of("name", "魔術圈側躺內收（進階）", "muscleGroup", "legs", "equipment", "props")).status())
                .as("an archived name can be reused").isEqualTo(201);
    }

    @Test
    void aCoachedSessionBelongsToOneScheduledClass() throws Exception {
        String sid = createStudent(coach, "cls");
        String other = createStudent(coach, "cls2");
        String apt = "apt_c" + suffix;
        call(put("/api/appointments/" + apt), coach, Map.of("studentId", sid, "startAt", Instant.now().toString(), "durationMin", 55, "location", "器械教室"));

        Map<String, Object> draft = new java.util.HashMap<>(workout(sid, "coached", "draft"));
        draft.put("appointmentId", apt);
        assertThat(call(put("/api/workouts/wo_c1" + suffix), coach, draft).status()).isEqualTo(200);
        assertThat(call(put("/api/workouts/wo_c2" + suffix), coach, draft).status()).as("one session per class").isEqualTo(409);
        Map<String, Object> wrong = new java.util.HashMap<>(workout(other, "coached", "draft"));
        wrong.put("appointmentId", apt);
        assertThat(call(put("/api/workouts/wo_c3" + suffix), coach, wrong).status()).as("someone else's class").isEqualTo(400);

        Map<String, Object> done = new java.util.HashMap<>(workout(sid, "coached", "completed"));
        done.put("appointmentId", apt);
        assertThat(call(put("/api/workouts/wo_c1" + suffix), coach, done).body().get("appointmentId").asString()).isEqualTo(apt);
        java.util.function.Supplier<String> status = () -> {
            try {
                for (JsonNode a : call(get("/api/appointments"), coach, null).body()) if (a.get("id").asString().equals(apt)) return a.get("status").asString();
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
            return null;
        };
        assertThat(status.get()).as("finishing the session completes the class").isEqualTo("completed");
        assertThat(call(delete("/api/workouts/wo_c1" + suffix), coach, null).status()).isEqualTo(204);
        assertThat(status.get()).as("deleting it puts the class back").isEqualTo("scheduled");
    }

    @Test
    void deletedStudentsLoseTheirSignIn() throws Exception {
        String sid = createStudent(coach, "gone");
        studentToken(sid);
        saveWorkout(coach, sid, "coached");
        assertThat(call(delete("/api/students/" + sid), coach, null).status()).isEqualTo(204);
        assertThat(call(post("/api/auth/login"), null, Map.of("email", "gone-" + suffix + "@example.com", "password", "student123")).status())
                .as("no account outside a studio").isEqualTo(401);
        assertThat(call(get("/api/students/" + sid), coach, null).status()).isEqualTo(404);
        assertThat(createStudent(coach, "gone")).as("the email can be used again").isNotBlank();
    }

    @Test
    void studentsWhoDeleteTheirAccountLeaveAnAnonymousRecord() throws Exception {
        String sid = createStudent(coach, "bye");
        String student = studentToken(sid);
        saveWorkout(coach, sid, "coached");
        addPackage(coach, sid, 10);
        assertThat(call(delete("/api/me"), student, null).status()).isEqualTo(204);
        JsonNode left = call(get("/api/students/" + sid), coach, null).body();
        assertThat(left.get("status").asString()).isEqualTo("inactive");
        assertThat(left.has("leftAt")).isTrue();
        assertThat(left.get("name").asString()).doesNotContain("bye");
        Map<String, Object> edit = new java.util.HashMap<>(Map.of("name", "bye", "email", "bye-" + suffix + "@example.com", "gender", "female",
                "goal", "core", "weeklyFrequency", 2, "status", "active"));
        assertThat(call(put("/api/students/" + sid), coach, edit).status()).as("can't be brought back").isIn(400, 409);
    }

    @Test
    void deductionsUseOldestPackageFirst() throws Exception {
        String sid = createStudent(coach, "eve");
        Resp older = call(post("/api/students/" + sid + "/packages"), coach,
                Map.of("name", "舊", "totalSessions", 1, "priceTwd", 0, "purchaseDate", Instant.now().minusSeconds(86400 * 30).toString()));
        addPackage(coach, sid, 10);
        String wo = saveWorkout(coach, sid, "coached");
        Resp d = call(post("/api/workouts/" + wo + "/deduction"), coach, null);
        assertThat(d.body().get("transaction").get("packageId").asString()).isEqualTo(older.body().get("id").asString());
    }

    @Test
    void studentSeesOnlyOwnDataAndCannotBill() throws Exception {
        String sid = createStudent(coach, "fay");
        createStudent(coach, "gus");
        String coachWorkout = saveWorkout(coach, sid, "coached");
        String student = studentToken(sid);

        JsonNode boot = call(get("/api/bootstrap"), student, null).body();
        assertThat(boot.get("students").size()).isEqualTo(1);
        assertThat(boot.get("students").get(0).get("coachNotes").asString()).as("teacher notes are private").isEmpty();
        assertThat(boot.get("coach").get("email").asString()).isEmpty();

        assertThat(call(put("/api/workouts/wo_s1" + suffix), student, workout(sid, "coached", "completed")).status())
                .as("students may only log their own practice").isEqualTo(403);
        assertThat(call(put("/api/workouts/wo_s2" + suffix), student, workout(sid, "independent", "completed")).status()).isEqualTo(200);
        assertThat(call(put("/api/workouts/wo_s2" + suffix), coach, workout(sid, "independent", "completed")).status())
                .as("a student's own practice is theirs to change").isEqualTo(403);
        assertThat(call(delete("/api/workouts/wo_s2" + suffix), coach, null).status()).as("…and to delete").isEqualTo(403);
        assertThat(call(put("/api/workouts/" + coachWorkout), student, workout(sid, "independent", "completed")).status())
                .as("cannot overwrite a teacher-logged session").isEqualTo(403);
        assertThat(call(post("/api/workouts/" + coachWorkout + "/deduction"), student, null).status()).isEqualTo(403);
        assertThat(call(post("/api/students"), student, Map.of()).status()).isIn(400, 403);
        assertThat(call(get("/api/students/" + boot.get("students").get(0).get("id").asString() + "x"), student, null).status()).isEqualTo(404);
        assertThat(call(get("/api/billing"), student, null).status()).as("billing is the studio's").isEqualTo(403);
    }

    @Test
    void teacherSchedulesClassesAndStudentsSeeOnlyTheirOwn() throws Exception {
        String sid = createStudent(coach, "kim");
        String other = createStudent(coach, "lee");
        String at = Instant.now().plusSeconds(86400).toString();
        Map<String, Object> slot = Map.of("studentId", sid, "startAt", at, "durationMin", 55, "location", "器械教室");
        String id = "apt_" + suffix;
        assertThat(call(put("/api/appointments/" + id), coach, slot).status()).as("client-generated id is accepted").isEqualTo(200);
        call(put("/api/appointments/apt_o" + suffix), coach, Map.of("studentId", other, "startAt", at, "durationMin", 55, "location", "器械教室"));

        Map<String, Object> cancelled = new java.util.HashMap<>(slot);
        cancelled.put("status", "cancelled");
        assertThat(call(put("/api/appointments/" + id), coach, cancelled).body().get("status").asString()).isEqualTo("cancelled");
        assertThat(call(put("/api/appointments/apt_x" + suffix), coach, Map.of("studentId", sid, "startAt", at, "durationMin", 5, "location", "器械教室")).status())
                .as("duration is validated").isEqualTo(400);

        String student = studentToken(sid);
        JsonNode mine = call(get("/api/appointments"), student, null).body();
        assertThat(mine.size()).as("students only see their own classes").isEqualTo(1);
        assertThat(mine.get(0).get("id").asString()).isEqualTo(id);
        assertThat(call(put("/api/appointments/apt_s" + suffix), student, slot).status()).as("students cannot schedule").isEqualTo(403);
        assertThat(call(delete("/api/appointments/" + id), student, null).status()).isEqualTo(403);

        assertThat(call(delete("/api/appointments/" + id), coach, null).status()).isEqualTo(204);
        assertThat(call(get("/api/appointments"), student, null).body().size()).isZero();
    }

    // ------------------------------------------------------------------ studios

    /** Invites a teacher and activates them; returns {teacherId, token}. */
    String[] teacher(String owner, String name) throws Exception {
        Resp inv = call(post("/api/studio/coaches"), owner, Map.of("name", name, "email", name + "-" + suffix + "@example.com"));
        assertThat(inv.status()).isEqualTo(201);
        Resp act = call(post("/api/auth/activate"), null, Map.of("inviteCode", inv.body().get("inviteCode").asString(), "password", "coach12345"));
        assertThat(act.status()).isEqualTo(200);
        assertThat(act.body().get("user").get("role").asString()).isEqualTo("coach");
        return new String[] {inv.body().get("coach").get("id").asString(), act.body().get("token").asString()};
    }

    @Test
    void ownerInvitesTeachersUpToTheSeatLimit() throws Exception {
        JsonNode studio = call(get("/api/bootstrap"), coach, null).body().get("studio");
        assertThat(studio.get("kind").asString()).isEqualTo("studio");
        assertThat(studio.get("maxCoaches").asInt()).isEqualTo(3);
        assertThat(studio.get("coaches").size()).as("the owner takes a seat").isEqualTo(1);

        String[] amy = teacher(coach, "amy");
        Resp pending = call(post("/api/studio/coaches"), coach, Map.of("name", "bob", "email", "bob-" + suffix + "@example.com"));
        assertThat(pending.body().get("coach").get("status").asString()).isEqualTo("invited");
        Resp full = call(post("/api/studio/coaches"), coach, Map.of("name", "cat", "email", "cat-" + suffix + "@example.com"));
        assertThat(full.status()).isEqualTo(409);
        assertThat(full.body().get("code").asString()).isEqualTo("seats_full");
        Resp taken = call(post("/api/studio/coaches"), otherStudio("own2"), Map.of("name", "amy", "email", "amy-" + suffix + "@example.com"));
        assertThat(taken.status()).as("someone with an account is never pulled into another studio").isEqualTo(409);

        assertThat(call(post("/api/auth/login"), null, Map.of("email", "amy-" + suffix + "@example.com", "password", "coach12345")).status()).isEqualTo(200);
        assertThat(call(post("/api/studio/coaches"), amy[1], Map.of("name", "x", "email", "x-" + suffix + "@example.com")).status())
                .as("teachers cannot invite teachers").isEqualTo(403);
        assertThat(call(post("/api/studio/leave"), amy[1], null).status()).as("no leaving to go solo").isIn(404, 405);
    }

    @Test
    void teachersSeeOnlyTheirOwnStudents() throws Exception {
        String[] amy = teacher(coach, "amy");
        String ownStudent = createStudent(coach, "own");
        Resp forAmy = call(post("/api/students"), coach, Map.of("name", "forAmy", "email", "foramy-" + suffix + "@example.com", "gender", "female",
                "goal", "core", "weeklyFrequency", 2, "status", "active", "coachId", amy[0]));
        assertThat(forAmy.status()).isEqualTo(201);
        String amyStudent = forAmy.body().get("id").asString();
        String amyOwn = createStudent(amy[1], "amyown");

        JsonNode amyBoot = call(get("/api/bootstrap"), amy[1], null).body();
        assertThat(amyBoot.get("students").size()).as("amy sees her two students").isEqualTo(2);
        assertThat(amyBoot.get("coach").get("name").asString()).as("the profile is amy's own").isEqualTo("amy");
        assertThat(call(get("/api/students/" + ownStudent), amy[1], null).status()).isEqualTo(404);
        assertThat(call(put("/api/workouts/wo_amy" + suffix), amy[1], workout(ownStudent, "coached", "completed")).status()).isEqualTo(404);
        assertThat(call(post("/api/students/" + ownStudent + "/packages"), amy[1], Map.of("name", "x", "totalSessions", 5, "priceTwd", 0,
                "purchaseDate", Instant.now().toString())).status()).isEqualTo(404);
        // IDs are client-chosen: knowing one must not let amy overwrite the records of a student who isn't hers.
        String ownersWorkout = saveWorkout(coach, ownStudent, "coached");
        assertThat(call(put("/api/workouts/" + ownersWorkout), amy[1], workout(amyOwn, "coached", "completed")).status()).isEqualTo(404);
        String ownersClass = "apt_own" + suffix;
        String at = Instant.now().plusSeconds(86400).toString();
        call(put("/api/appointments/" + ownersClass), coach, Map.of("studentId", ownStudent, "startAt", at, "durationMin", 55, "location", "器械教室"));
        assertThat(call(put("/api/appointments/" + ownersClass), amy[1], Map.of("studentId", amyOwn, "startAt", at, "durationMin", 55, "location", "器械教室")).status())
                .isEqualTo(404);
        assertThat(call(get("/api/students"), coach, null).body().size()).as("the owner sees every student").isEqualTo(3);
        String rels = call(get("/api/bootstrap"), coach, null).body().get("relationships").toString();
        assertThat(rels).contains(amy[0]).contains(coachId);

        assertThat(call(put("/api/students/" + amyOwn + "/coach"), amy[1], Map.of("coachId", coachId)).status()).as("only the owner moves students").isEqualTo(403);

        // A private session records who taught it: amy for her class, the owner when substituting.
        String amyClass = "wo_ac" + suffix, subClass = "wo_sc" + suffix;
        assertThat(call(put("/api/workouts/" + amyClass), amy[1], workout(amyStudent, "coached", "completed")).body().get("coachId").asString()).isEqualTo(amy[0]);
        assertThat(call(put("/api/workouts/" + subClass), coach, workout(amyStudent, "coached", "completed")).body().get("coachId").asString()).isEqualTo(coachId);
        assertThat(call(put("/api/workouts/" + amyClass), coach, workout(amyStudent, "coached", "completed")).body().get("coachId").asString())
                .as("editing keeps who taught").isEqualTo(amy[0]);
    }

    @Test
    void removingATeacherHandsOverTheirStudentsAndEndsTheirAccess() throws Exception {
        String[] amy = teacher(coach, "amy");
        String[] ben = teacher(coach, "ben");
        String s1 = createStudent(amy[1], "s1");
        call(put("/api/workouts/wo_s1" + suffix), amy[1], workout(s1, "coached", "completed"));

        assertThat(call(put("/api/students/" + s1 + "/coach"), coach, Map.of("coachId", ben[0])).status()).isEqualTo(204);
        assertThat(call(get("/api/students/" + s1), ben[1], null).status()).as("ben now teaches s1").isEqualTo(200);
        assertThat(call(get("/api/students/" + s1), amy[1], null).status()).isEqualTo(404);
        assertThat(call(get("/api/workouts?studentId=" + s1), ben[1], null).body().size()).as("history moves with the student").isEqualTo(1);

        assertThat(call(post("/api/studio/coaches/" + ben[0] + "/deactivate"), coach, Map.of()).status()).as("must say who takes ben's students").isEqualTo(400);
        assertThat(call(post("/api/studio/coaches/" + ben[0] + "/deactivate"), coach, Map.of("transferTo", coachId)).status()).isEqualTo(204);
        assertThat(call(get("/api/bootstrap"), ben[1], null).status()).as("ben's token stops working at once").isEqualTo(401);
        assertThat(call(post("/api/auth/login"), null, Map.of("email", "ben-" + suffix + "@example.com", "password", "coach12345")).status())
                .as("ben can't sign in any more (no account outside the studio)").isEqualTo(401);
        JsonNode coaches = call(get("/api/bootstrap"), coach, null).body().get("studio").get("coaches");
        String benStatus = null;
        for (JsonNode c : coaches) if (c.get("id").asString().equals(ben[0])) benStatus = c.get("status").asString();
        assertThat(benStatus).as("listed as deactivated").isEqualTo("inactive");
        assertThat(call(get("/api/students/" + s1), coach, null).status()).isEqualTo(200);
        assertThat(call(post("/api/studio/coaches"), coach, Map.of("name", "cat", "email", "cat-" + suffix + "@example.com")).status())
                .as("ben's seat is free again").isEqualTo(201);
        assertThat(call(post("/api/studio/coaches/" + coachId + "/deactivate"), coach, Map.of()).status()).isEqualTo(400);
    }

    @Test
    void workoutSaveIsIdempotentAndReplacesExercises() throws Exception {
        String sid = createStudent(coach, "ivy");
        String id = "wo_idem" + suffix;
        call(put("/api/workouts/" + id), coach, workout(sid, "coached", "draft"));
        Map<String, Object> updated = new java.util.HashMap<>(workout(sid, "coached", "completed"));
        updated.put("exercises", List.of(
                Map.of("id", "el_a", "exerciseId", "px_hundred_r", "sets", List.of(Map.of("id", "set_a", "springs", "1紅1藍", "reps", 10, "completed", true))),
                Map.of("id", "el_b", "exerciseId", "px_elephant", "sets", List.of(Map.of("id", "set_b", "springs", "1紅1藍", "reps", 8, "completed", false)))));
        Resp r = call(put("/api/workouts/" + id), coach, updated);
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body().get("exercises").size()).isEqualTo(2);
        assertThat(r.body().get("exercises").get(0).get("id").asString()).isEqualTo("el_a");
        assertThat(r.body().get("completedAt")).isNotNull();
        assertThat(call(get("/api/workouts?studentId=" + sid), coach, null).body().size()).isEqualTo(1);

        Map<String, Object> noSets = new java.util.HashMap<>(workout(sid, "coached", "completed"));
        noSets.put("exercises", List.of());
        assertThat(call(put("/api/workouts/wo_empty" + suffix), coach, noSets).status()).as("completed needs a completed set").isEqualTo(400);
        Map<String, Object> unknown = new java.util.HashMap<>(workout(sid, "coached", "completed"));
        unknown.put("exercises", List.of(Map.of("id", "el_u", "exerciseId", "ex_squat", "sets", List.of(Map.of("id", "set_u", "reps", 5, "completed", true)))));
        assertThat(call(put("/api/workouts/wo_unknown" + suffix), coach, unknown).status()).as("Lift's barbell moves aren't here").isEqualTo(400);
    }

    @Test
    void demoImportAndLogin() throws Exception {
        Map<String, Object> data = Map.ofEntries(
                Map.entry("schemaVersion", 1),
                Map.entry("seededAt", Instant.now().toString()),
                Map.entry("coach", Map.of("id", "coach_demo", "role", "coach", "name", "示範老師", "email", "demo-" + suffix + "@example.com",
                        "title", "老師", "studio", "光合皮拉提斯", "createdAt", Instant.now().toString())),
                Map.entry("students", List.of(Map.ofEntries(
                        Map.entry("id", "stu_demo1"), Map.entry("role", "student"), Map.entry("name", "學員一"),
                        Map.entry("email", "s1-" + suffix + "@example.com"), Map.entry("gender", "female"), Map.entry("goal", "posture"),
                        Map.entry("goalDetail", ""), Map.entry("status", "active"), Map.entry("weeklyFrequency", 2), Map.entry("coachNotes", ""),
                        Map.entry("joinedAt", Instant.now().toString()), Map.entry("createdAt", Instant.now().toString())))),
                Map.entry("relationships", List.of()),
                Map.entry("exercises", List.of()),
                Map.entry("workouts", List.of(Map.of("id", "wo_demo1", "studentId", "stu_demo1", "coachId", "coach_demo", "type", "coached",
                        "createdBy", "coach", "status", "completed", "title", "核心床基礎", "startedAt", Instant.now().toString(), "notes", "",
                        "exercises", List.of(Map.of("id", "el_d", "exerciseId", "px_footwork",
                                "sets", List.of(Map.of("id", "set_d", "springs", "3紅", "reps", 10, "completed", true))))))),
                Map.entry("packages", List.of(Map.of("id", "pkg_demo1", "studentId", "stu_demo1", "coachId", "coach_demo", "name", "10 堂器械私人課",
                        "totalSessions", 10, "priceTwd", 20000, "purchaseDate", Instant.now().toString()))),
                Map.entry("transactions", List.of()),
                Map.entry("metrics", List.of()),
                Map.entry("appointments", List.of()));
        assertThat(call(post("/api/demo/import"), null, data).status()).isEqualTo(200);
        Resp login = call(post("/api/demo/login"), null, Map.of("role", "student", "studentId", "stu_demo1"));
        assertThat(login.status()).isEqualTo(200);
        String token = login.body().get("token").asString();
        assertThat(remaining(token, "stu_demo1")).isEqualTo(10);
        assertThat(call(get("/api/workouts/wo_demo1"), token, null).body().get("exercises").get(0).get("sets").get(0).get("springs").asString())
                .as("springs survive the import").isEqualTo("3紅");
        assertThat(call(post("/api/auth/login"), null, Map.of("email", "demo-" + suffix + "@example.com", "password", "demo1234")).status()).isEqualTo(200);
    }
}
