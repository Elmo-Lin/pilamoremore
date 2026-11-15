package com.example.backend.common;

import java.util.Set;

/** Allowed values for string-typed domain fields (mirrors frontend/src/types). */
public final class Domain {

    private Domain() {}

    public static final String COACH = "coach";
    /** Studio owner: a coach who also manages the studio (invites coaches, sees every student). */
    public static final String OWNER = "owner";
    public static final String STUDENT = "student";

    /** Every workspace ({@code coaches/{id}}) is a studio: Pila More More has no free coaches or self-trackers. */
    public static final String SPACE_STUDIO = "studio";

    public static final Set<String> GOALS = Set.of("core", "posture", "pain", "flexibility", "postnatal", "general");
    public static final Set<String> MUSCLE_GROUPS = Set.of("legs", "back", "chest", "shoulders", "arms", "glutes", "core", "cardio");
    /** The Pilates apparatus a move is done on (or the mat, small props). */
    public static final Set<String> EQUIPMENT = Set.of("reformer", "mat", "cadillac", "chair", "barrel", "props", "other");
    public static final Set<String> GENDERS = Set.of("female", "male", "other");
    public static final Set<String> STUDENT_STATUSES = Set.of("active", "inactive");
    public static final Set<String> WORKOUT_TYPES = Set.of("coached", "independent");
    public static final Set<String> WORKOUT_STATUSES = Set.of("draft", "completed");
    public static final Set<String> APPOINTMENT_STATUSES = Set.of("scheduled", "completed", "cancelled");
    public static final Set<String> METRIC_TYPES = Set.of("bodyweight");

    public static final String TX_DEDUCTION = "deduction";
    public static final String TX_REVERSAL = "reversal";
    public static final String TX_ADJUSTMENT = "adjustment";

    public static String require(Set<String> allowed, String value, String field) {
        if (value == null || !allowed.contains(value)) {
            throw ApiException.badRequest(field + " 的值不正確：" + value);
        }
        return value;
    }
}
