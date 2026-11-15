package com.example.backend.push;

import com.example.backend.auth.CurrentUser;
import com.example.backend.common.ApiException;
import com.example.backend.domain.Appointment;
import com.example.backend.domain.Student;
import com.example.backend.push.PushService.Message;
import com.example.backend.store.Db;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.DocumentReference;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Class reminders. At 1 p.m. the day before (Cloud Scheduler calls {@link #remindTomorrow}), each student
 * hears about tomorrow's classes and each coach gets their day's list. When a coming class is
 * cancelled, deleted or moved, the student hears at once, and so does their coach when someone else
 * (e.g. the studio owner) made the change. All times are Taiwan time.
 */
@Service
public class ReminderService {

    static final ZoneId ZONE = ZoneId.of("Asia/Taipei");
    private static final String WEEKDAYS = "一二三四五六日";
    /** Notification text is shown in a few lines; longer lists are cut. */
    private static final int MAX_BODY = 120;

    /** {@code reminderRuns/{yyyy-mm-dd}}: the day-before reminder for that day went out (so retries don't repeat it). */
    public static class Run {
        public Instant startedAt;
    }

    private final Db db;
    private final PushService push;

    public ReminderService(Db db, PushService push) {
        this.db = db;
        this.push = push;
    }

    /** Sends the reminders for the day after {@code today}; returns how many people were notified, or -1 if already sent. */
    public int remindTomorrow(LocalDate today) {
        LocalDate day = today.plusDays(1);
        Run run = new Run();
        run.startedAt = Instant.now();
        try {
            db.create(db.doc(Db.REMINDER_RUNS, day.toString()), run);
        } catch (ApiException e) {
            if (e.status().value() == 409) return -1;
            throw e;
        }
        Timestamp from = timestamp(day.atStartOfDay(ZONE).toInstant());
        Timestamp to = timestamp(day.plusDays(1).atStartOfDay(ZONE).toInstant());

        Map<String, List<Appointment>> byStudent = new LinkedHashMap<>();
        Map<String, List<String>> byCoach = new LinkedHashMap<>();
        for (DocumentReference space : db.fs.collection(Db.COACHES).listDocuments()) {
            List<Appointment> classes = db.list(db.coachCol(space.getId(), Db.APPOINTMENTS)
                            .whereGreaterThanOrEqualTo("startAt", from).whereLessThan("startAt", to), Appointment.class).stream()
                    .filter(a -> "scheduled".equals(a.status))
                    .sorted(Comparator.comparing((Appointment a) -> a.startAt))
                    .toList();
            Map<String, Student> students = new LinkedHashMap<>();
            for (Appointment a : classes) {
                Student s = students.computeIfAbsent(a.studentId,
                        id -> db.get(db.coachDoc(space.getId(), Db.STUDENTS, id), Student.class).orElse(null));
                if (s == null) continue;
                byStudent.computeIfAbsent(s.id, k -> new ArrayList<>()).add(a);
                byCoach.computeIfAbsent(s.coach(), k -> new ArrayList<>()).add(time(a.startAt) + " " + s.name);
            }
        }

        String date = date(day);
        byStudent.forEach((studentId, classes) -> push.notify(studentId, classes.size() == 1
                ? new Message("明天有課", date + " " + time(classes.get(0).startAt) + "・" + classes.get(0).location + "・" + classes.get(0).durationMin + " 分鐘", "/student/plan")
                : new Message("明天有 " + classes.size() + " 堂課", date + " " + classes.stream().map(a -> time(a.startAt) + " " + a.location).collect(Collectors.joining("、")), "/student/plan")));
        byCoach.forEach((coachId, lines) -> push.notify(coachId,
                new Message("明天有 " + lines.size() + " 堂課", cut(date + " " + String.join("、", lines)), "/coach/schedule")));
        return byStudent.size() + byCoach.size();
    }

    /** {@code after} is null when the class was deleted. Only coming, still-scheduled classes are announced. */
    public void classChanged(CurrentUser actor, Appointment before, Appointment after) {
        if (before == null || !"scheduled".equals(before.status) || before.startAt == null || before.startAt.isBefore(Instant.now())) return;
        String forStudent;
        String title;
        if (after == null || "cancelled".equals(after.status) || !before.studentId.equals(after.studentId)) {
            title = "課程已取消";
            forStudent = when(before) + " 的課已取消";
        } else if ("scheduled".equals(after.status) && (!after.startAt.equals(before.startAt) || !Objects.equals(after.location, before.location))) {
            boolean moved = !after.startAt.equals(before.startAt);
            title = moved ? "課程時間已更改" : "課程地點已更改";
            forStudent = (moved ? when(before) + " 的課改到 " + when(after) : when(after) + " 的課") + (Objects.equals(after.location, before.location) ? "" : "・地點：" + after.location);
        } else {
            return;
        }
        Student s = db.get(db.coachDoc(actor.coachId(), Db.STUDENTS, before.studentId), Student.class).orElse(null);
        if (s == null) return;
        push.notify(s.id, new Message(title, forStudent, "/student/plan"));
        if (!actor.userId().equals(s.coach())) push.notify(s.coach(), new Message(title, s.name + " " + forStudent, "/coach/schedule"));
    }

    private static String when(Appointment a) {
        return date(a.startAt.atZone(ZONE).toLocalDate()) + " " + time(a.startAt);
    }

    /** e.g. 10/26（一） */
    static String date(LocalDate d) {
        return d.getMonthValue() + "/" + d.getDayOfMonth() + "（" + WEEKDAYS.charAt(d.getDayOfWeek().getValue() - 1) + "）";
    }

    static String time(Instant at) {
        ZonedDateTime t = at.atZone(ZONE);
        return String.format("%02d:%02d", t.getHour(), t.getMinute());
    }

    private static String cut(String s) {
        return s.length() <= MAX_BODY ? s : s.substring(0, MAX_BODY - 1) + "…";
    }

    private static Timestamp timestamp(Instant i) {
        return Timestamp.ofTimeSecondsAndNanos(i.getEpochSecond(), i.getNano());
    }
}
