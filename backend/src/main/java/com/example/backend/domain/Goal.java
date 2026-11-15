package com.example.backend.domain;

import java.time.Instant;

/**
 * {@code coaches/{coachId}/goals/{id}} — a move someone is working towards, e.g. Teaser 10 reps by
 * December. Set by the person themself; whether it is reached is worked out from their workouts.
 */
public class Goal {
    public String id;
    public String studentId;
    public String exerciseId;
    public int targetReps;
    /** Optional: when they want to get there. */
    public Instant deadline;
    public Instant createdAt;
}
