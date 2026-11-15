package com.example.backend.auth;

import com.example.backend.common.ApiException;
import com.example.backend.common.Domain;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The authenticated caller. {@code coachId} is the studio every query is scoped by (its ID is its
 * owner's), for the owner, its teachers and its students alike.
 */
public record CurrentUser(String userId, String role, String coachId) {

    public static CurrentUser from(Jwt jwt) {
        return new CurrentUser(jwt.getSubject(), jwt.getClaimAsString("role"), jwt.getClaimAsString("coachId"));
    }

    /** Coaches and studio owners (owners teach too). */
    public boolean isCoach() {
        return Domain.COACH.equals(role) || isOwner();
    }

    public boolean isOwner() {
        return Domain.OWNER.equals(role);
    }

    /** A teacher of the studio who isn't its owner. */
    public boolean isStudioCoach() {
        return Domain.COACH.equals(role) && !userId.equals(coachId);
    }

    /** Students: may only see and log their own data, never bill or manage others. */
    public boolean isStudent() {
        return Domain.STUDENT.equals(role);
    }

    public CurrentUser requireCoach() {
        if (!isCoach()) throw ApiException.forbidden("只有老師可以執行此操作");
        return this;
    }

    public CurrentUser requireOwner() {
        if (!isOwner()) throw ApiException.forbidden("只有工作室經營者可以執行此操作");
        return this;
    }
}
