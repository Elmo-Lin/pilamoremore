package com.example.backend.domain;

import java.time.Instant;

/**
 * {@code coaches/{id}} — a studio: everything in it lives in subcollections of this document. Its ID
 * is its owner's user ID. Name, title and contact describe the owner.
 */
public class Coach {
    public String id;
    /** Always {@link com.example.backend.common.Domain#SPACE_STUDIO}. */
    public String kind;
    public String name;
    public String email;
    public String phone;
    public String title;
    public String studio;
    /** Coaching workspaces only; null until it changes (the trial then counts from {@link #createdAt}). */
    public Subscription subscription;
    public Instant createdAt;
}
