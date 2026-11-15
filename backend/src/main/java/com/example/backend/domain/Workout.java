package com.example.backend.domain;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * {@code coaches/{coachId}/workouts/{id}} — a logged session with embedded exercises and sets.
 * {@code coached} sessions may be billed via a separate deduction; {@code independent} never.
 */
public class Workout {
    public String id;
    public String studentId;
    public String coachId;
    public String type;
    public String createdBy;
    public String status;
    public String title;
    /** The scheduled class this coached session was logged for. */
    public String appointmentId;
    public Instant startedAt;
    public Instant completedAt;
    public Instant updatedAt;
    public String notes = "";
    public List<ExerciseLog> exercises = new ArrayList<>();
    /**
     * Bumped on every billing change. Not data — it makes concurrent deductions on the same
     * workout conflict inside Firestore transactions so one of them retries and sees the other.
     */
    public long billingRevision;

    public static class ExerciseLog {
        public String id;
        public String exerciseId;
        public List<SetLog> sets = new ArrayList<>();
        public String notes;
        /** Consecutive exercises with the same id form a superset. */
        public String supersetId;
    }

    public static class SetLog {
        public String id;
        /** Spring setting on the apparatus, e.g. "1紅1藍"; null on the mat or with props. */
        public String springs;
        public Double weightKg;
        public Integer reps;
        public Double rpe;
        public boolean completed;
        /** Cardio: how long, in seconds. */
        public Integer durationSec;
        /** Cardio: how far, in km (optional). */
        public Double distanceKm;
        /** Cardio: average heart rate in bpm (optional; what a watch reports). */
        public Integer avgHeartRate;
        /** Cardio: active energy in kcal (optional; what a watch reports). */
        public Integer calories;
    }
}
