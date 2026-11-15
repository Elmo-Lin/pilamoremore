package com.example.backend.service;

import com.example.backend.store.Db;
import com.google.cloud.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * When each account last opened the app ({@code users/{id}.lastSeenAt}), for the admin page. Set
 * when the app loads its data, written at most once an hour per account and server instance.
 */
@Component
public class LastSeen {

    private static final Duration EVERY = Duration.ofHours(1);

    private final Db db;
    private final Map<String, Instant> written = new ConcurrentHashMap<>();

    public LastSeen(Db db) {
        this.db = db;
    }

    public void touch(String userId) {
        Instant now = Instant.now();
        Instant last = written.get(userId);
        if (last != null && now.isBefore(last.plus(EVERY))) return;
        written.put(userId, now);
        // Not awaited: a lost write only leaves the admin page an hour behind, never slows the app.
        db.doc(Db.USERS, userId).update("lastSeenAt", Timestamp.ofTimeSecondsAndNanos(now.getEpochSecond(), now.getNano()));
    }
}
