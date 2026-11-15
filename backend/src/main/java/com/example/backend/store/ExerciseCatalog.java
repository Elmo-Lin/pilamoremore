package com.example.backend.store;

import com.example.backend.domain.Exercise;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.stereotype.Component;

/**
 * Moves: the built-in Pilates repertoire (generated from frontend/src/data/exercises.ts, which must
 * stay identical; nothing is seeded) plus each workspace's own custom exercises in
 * {@code coaches/{id}/exercises}. Custom ones are never deleted, only archived, so old workouts and
 * progress charts keep their names.
 */
@Component
public class ExerciseCatalog {

    public static final List<Exercise> BUILT_IN = List.of(
            new Exercise("px_footwork", "腳步運動", "Footwork", "legs", "reformer"),
            new Exercise("px_hundred_r", "百次拍擊（核心床）", "Hundred on the Reformer", "core", "reformer"),
            new Exercise("px_bridge_r", "橋式（核心床）", "Bridging on the Reformer", "glutes", "reformer"),
            new Exercise("px_feetstraps", "腳套系列", "Feet in Straps", "legs", "reformer"),
            new Exercise("px_shortspine", "短脊椎按摩", "Short Spine Massage", "core", "reformer"),
            new Exercise("px_coordination", "協調", "Coordination", "core", "reformer"),
            new Exercise("px_backstroke", "仰泳", "Backstroke", "core", "reformer"),
            new Exercise("px_rowing", "划船系列", "Rowing Series", "shoulders", "reformer"),
            new Exercise("px_armsstraps", "仰臥手拉繩", "Arms in Straps", "arms", "reformer"),
            new Exercise("px_chestexp", "胸部擴展", "Chest Expansion", "back", "reformer"),
            new Exercise("px_pullstraps", "俯臥拉繩", "Pulling Straps", "back", "reformer"),
            new Exercise("px_shortbox", "短箱系列", "Short Box Series", "core", "reformer"),
            new Exercise("px_elephant", "大象", "Elephant", "core", "reformer"),
            new Exercise("px_kneestretch", "膝伸展", "Knee Stretches", "core", "reformer"),
            new Exercise("px_longstretch", "長伸展", "Long Stretch", "core", "reformer"),
            new Exercise("px_downstretch", "下伸展", "Down Stretch", "back", "reformer"),
            new Exercise("px_upstretch", "上伸展", "Up Stretch", "core", "reformer"),
            new Exercise("px_stomachmassage", "腹部按摩", "Stomach Massage", "core", "reformer"),
            new Exercise("px_semicircle", "半圓", "Semi-Circle", "back", "reformer"),
            new Exercise("px_sidesplits", "側劈腿", "Side Splits", "legs", "reformer"),
            new Exercise("px_frontsplits", "前劈腿", "Front Splits", "legs", "reformer"),
            new Exercise("px_scooter", "滑板車", "Scooter", "glutes", "reformer"),
            new Exercise("px_mermaid_r", "美人魚（核心床）", "Mermaid on the Reformer", "core", "reformer"),
            new Exercise("px_teaser_r", "V 字平衡（核心床）", "Teaser on the Reformer", "core", "reformer"),
            new Exercise("px_hundred", "百次拍擊", "The Hundred", "core", "mat"),
            new Exercise("px_rollup", "捲上", "Roll Up", "core", "mat"),
            new Exercise("px_legcircles", "單腿畫圈", "Single Leg Circles", "core", "mat"),
            new Exercise("px_rolling", "像球一樣滾動", "Rolling Like a Ball", "core", "mat"),
            new Exercise("px_singleleg", "單腿伸展", "Single Leg Stretch", "core", "mat"),
            new Exercise("px_doubleleg", "雙腿伸展", "Double Leg Stretch", "core", "mat"),
            new Exercise("px_criss", "交叉捲腹", "Criss-Cross", "core", "mat"),
            new Exercise("px_spinestretch", "脊椎前伸", "Spine Stretch Forward", "back", "mat"),
            new Exercise("px_saw", "鋸子", "The Saw", "core", "mat"),
            new Exercise("px_swan", "天鵝", "Swan", "back", "mat"),
            new Exercise("px_singlekick", "單腿踢", "Single Leg Kick", "legs", "mat"),
            new Exercise("px_sidekick", "側踢系列", "Side Kick Series", "glutes", "mat"),
            new Exercise("px_teaser", "V 字平衡", "Teaser", "core", "mat"),
            new Exercise("px_swimming", "游泳", "Swimming", "back", "mat"),
            new Exercise("px_legpullfront", "前撐抬腿", "Leg Pull Front", "core", "mat"),
            new Exercise("px_sidebend", "側彎", "Side Bend", "core", "mat"),
            new Exercise("px_bridge", "骨盆捲動", "Pelvic Curl", "glutes", "mat"),
            new Exercise("px_corkscrew", "開瓶器", "Corkscrew", "core", "mat"),
            new Exercise("px_seal", "海豹", "Seal", "core", "mat"),
            new Exercise("px_pushup", "皮拉提斯伏地挺身", "Pilates Push-up", "chest", "mat"),
            new Exercise("px_chair_footwork", "椅上腳步運動", "Footwork on the Chair", "legs", "chair"),
            new Exercise("px_chair_mountain", "登山", "Mountain Climb", "glutes", "chair"),
            new Exercise("px_chair_pike", "屈體上提", "Pike", "core", "chair"),
            new Exercise("px_chair_swan", "天鵝（穩踏椅）", "Swan on the Chair", "back", "chair"),
            new Exercise("px_chair_triceps", "三頭下壓", "Triceps Press", "arms", "chair"),
            new Exercise("px_cad_rollback", "捲下桿", "Roll Back Bar", "core", "cadillac"),
            new Exercise("px_cad_legsprings", "腿部彈簧系列", "Leg Springs", "legs", "cadillac"),
            new Exercise("px_cad_armsprings", "手臂彈簧系列", "Arm Springs", "arms", "cadillac"),
            new Exercise("px_cad_pushthrough", "推穿桿", "Push Through", "back", "cadillac"),
            new Exercise("px_cad_catstretch", "貓式伸展", "Cat Stretch", "back", "cadillac"),
            new Exercise("px_barrel_swan", "天鵝（梯桶）", "Swan on the Barrel", "back", "barrel"),
            new Exercise("px_barrel_side", "側伸展（梯桶）", "Side Stretch on the Barrel", "core", "barrel"),
            new Exercise("px_barrel_horseback", "騎馬", "Horseback", "glutes", "barrel"),
            new Exercise("px_ring_squeeze", "魔術圈內收", "Magic Circle Squeeze", "legs", "props"),
            new Exercise("px_ring_press", "魔術圈胸推", "Magic Circle Chest Press", "chest", "props"),
            new Exercise("px_band_rotation", "彈力帶肩外旋", "Band External Rotation", "shoulders", "props"),
            new Exercise("px_ball_bridge", "抗力球橋式", "Ball Bridge", "glutes", "props"),
            new Exercise("px_arm_weights", "小啞鈴手臂系列", "Arm Series with Light Weights", "arms", "props"),
            new Exercise("px_jumpboard", "跳板跳躍", "Jump Board", "cardio", "reformer"),
            new Exercise("px_walk", "快走", "Brisk Walk", "cardio", "other"),
            new Exercise("px_run", "戶外跑步", "Outdoor Run", "cardio", "other"));

    private final Db db;

    public ExerciseCatalog(Db db) {
        this.db = db;
    }

    /** Built-ins plus the workspace's custom exercises (archived ones included, for history). */
    public List<Exercise> forWorkspace(String spaceId) {
        List<Exercise> all = new ArrayList<>(BUILT_IN);
        all.addAll(custom(spaceId));
        return all;
    }

    public List<Exercise> custom(String spaceId) {
        return db.list(db.coachCol(spaceId, Db.EXERCISES), Exercise.class);
    }

    /** IDs a workout or plan in this workspace may use. */
    public Set<String> knownIds(String spaceId) {
        return Stream.concat(BUILT_IN.stream(), custom(spaceId).stream()).map(e -> e.id).collect(Collectors.toSet());
    }
}
