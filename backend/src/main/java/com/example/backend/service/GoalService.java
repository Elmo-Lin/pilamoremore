package com.example.backend.service;

import com.example.backend.auth.CurrentUser;
import com.example.backend.common.ApiException;
import com.example.backend.common.Ids;
import com.example.backend.domain.Goal;
import com.example.backend.store.Db;
import com.example.backend.store.ExerciseCatalog;
import com.example.backend.web.Dtos.GoalDto;
import java.time.Instant;
import org.springframework.stereotype.Service;

/** Training goals are personal: each person sets and removes their own (coaches can see their students'). */
@Service
public class GoalService {

    /** Enough for every lift someone cares about; stops a runaway client filling the workspace. */
    static final int MAX_PER_PERSON = 20;

    private final Db db;
    private final ExerciseCatalog catalog;

    public GoalService(Db db, ExerciseCatalog catalog) {
        this.db = db;
        this.catalog = catalog;
    }

    /** Create or replace one of the caller's goals (PUT semantics, client-chosen ID). */
    public GoalDto save(CurrentUser user, String id, GoalDto in) {
        requireTrainee(user);
        if (!catalog.knownIds(user.coachId()).contains(in.exerciseId())) throw ApiException.badRequest("未知的動作：" + in.exerciseId());
        String goalId = Ids.orNew(id, "goal");
        var ref = db.coachDoc(user.coachId(), Db.GOALS, goalId);
        Goal existing = db.get(ref, Goal.class).orElse(null);
        if (existing != null && !user.userId().equals(existing.studentId)) throw ApiException.notFound("找不到目標");
        if (existing == null && Db.await(db.coachCol(user.coachId(), Db.GOALS).whereEqualTo("studentId", user.userId()).count().get()).getCount() >= MAX_PER_PERSON) {
            throw ApiException.badRequest("目標最多 " + MAX_PER_PERSON + " 個，請先刪除不需要的");
        }
        Goal g = new Goal();
        g.id = goalId;
        g.studentId = user.userId();
        g.exerciseId = in.exerciseId();
        g.targetReps = in.targetReps();
        g.deadline = in.deadline();
        g.createdAt = existing != null ? existing.createdAt : Instant.now();
        db.set(ref, g);
        return Mapper.goal(g);
    }

    public void delete(CurrentUser user, String id) {
        requireTrainee(user);
        var ref = db.coachDoc(user.coachId(), Db.GOALS, id);
        Goal g = db.get(ref, Goal.class).orElse(null);
        if (g == null || !user.userId().equals(g.studentId)) throw ApiException.notFound("找不到目標");
        db.delete(ref);
    }

    private static void requireTrainee(CurrentUser user) {
        if (!user.isStudent()) throw ApiException.forbidden("練習目標由本人設定");
    }
}
