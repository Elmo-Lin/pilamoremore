package com.example.backend.domain;

import java.time.Instant;

/**
 * Embedded in {@code coaches/{id}.subscription}. Every studio is on the Team plan. A workspace without one is on its trial,
 * counted from the workspace's creation (see {@link com.example.backend.billing.Plans#access}).
 */
public class Subscription {
    /**
     * trialing, active (paid), past_due (the last renewal failed), canceled (runs to the period's end)
     * or complimentary (永久版: free for good, set on the admin page).
     */
    public String status;
    public Instant trialEndsAt;
    public Instant currentPeriodStart;
    public Instant currentPeriodEnd;
    public int extraStudentPacks;
    public int extraCoachSeats;
    /** Downgrades wait for the next renewal; null = no change scheduled. */
    public Integer nextExtraStudentPacks;
    public Integer nextExtraCoachSeats;
    /** What the NewebPay mandate charges each month. */
    public int monthlyAmount;
    /** NewebPay periodic mandate: its order number and PeriodNo. */
    public String mandateOrderNo;
    public String periodNo;
    /** Mandate charges already applied (NewebPay's AlreadyTimes), so repeated notifications are ignored. */
    public int paidPeriods;
}
