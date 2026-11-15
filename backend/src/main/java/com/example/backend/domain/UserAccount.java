package com.example.backend.domain;

import java.time.Instant;
import java.util.List;

/**
 * {@code users/{id}} — login identity for coaches and students.
 * Students have no password until they activate an invite.
 */
public class UserAccount {
    public String id;
    public String role;
    public String name;
    public String email;
    public String phone;
    public String passwordHash;
    /** Google account ID ({@code sub}) once the user has signed in with Google. */
    public String googleSub;
    /** Apple account ID ({@code sub}) once the user has signed in with Apple. */
    public String appleSub;
    /**
     * Proven to own the email: signed in with Google, opened the verification link, or reset the
     * password from a mailed link. {@code false}: signed up with a password and not yet verified, so
     * the account can't be used until it is. Unset: from before sign-ups were verified.
     */
    public Boolean emailVerified;
    /** {@code false}: no class reminders by email when push doesn't reach them (unset = on). */
    public Boolean emailReminders;
    /** The studio this account belongs to (its ID is the owner's user ID). */
    public String coachId;
    /** Coaches: shown on their profile (the workspace's title is used for the owner of older data). */
    public String title;
    /** Studio coaches the owner has deactivated can no longer sign in; null means active. */
    public Boolean active;
    /** Studio coaches: outstanding invite code until they activate. */
    public String inviteCode;
    /** Coaches: quick-select options when adding a session package; null until they customize (the UI shows defaults). */
    public List<PackagePreset> packagePresets;
    public Instant createdAt;
    /** When the app last loaded this account's data (see LastSeen); for the admin page. */
    public Instant lastSeenAt;

    /** Whether the user can sign in yet (a password, Google or Apple). Invited users have none until they activate. */
    public boolean hasLogin() {
        return passwordHash != null || googleSub != null || appleSub != null;
    }

    public static class PackagePreset {
        public String name;
        public int totalSessions;
        public int priceTwd;
    }
}
