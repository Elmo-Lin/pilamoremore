package com.example.backend.auth;

import com.example.backend.common.ApiException;
import com.example.backend.domain.UserAccount;
import com.example.backend.store.Db;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Set;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Lets controllers declare a {@link CurrentUser} parameter. Every token is re-checked against its
 * account on every request, so a deactivated coach, or someone whose role or workspace changed,
 * loses the old access immediately rather than when the token expires.
 */
@Configuration
public class CurrentUserResolver implements WebMvcConfigurer, HandlerMethodArgumentResolver {

    /** All a new account can do before proving its email: see who it is, get a fresh token, ask for another link, or delete itself. */
    private static final Set<String> BEFORE_VERIFYING = Set.of("/api/auth/me", "/api/auth/refresh", "/api/auth/verify-email/resend", "/api/me");

    private final Db db;

    public CurrentUserResolver(@Lazy Db db) {
        this.db = db;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(this);
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.getParameterType().equals(CurrentUser.class);
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mav, NativeWebRequest request, WebDataBinderFactory binder) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth != null && auth.getPrincipal() instanceof Jwt jwt)) throw ApiException.unauthorized("請先登入");
        CurrentUser user = CurrentUser.from(jwt);
        UserAccount u = db.get(db.doc(Db.USERS, user.userId()), UserAccount.class).orElse(null);
        if (u == null || Boolean.FALSE.equals(u.active)) throw ApiException.unauthorized("此帳號已停用，請聯絡工作室");
        // A token names a role in a workspace. People move — a coach leaves or joins a studio, a student
        // goes off to train on their own — and then a token from before (another device) stops working,
        // except to swap it for a current one (POST /auth/refresh): the app does that when told
        // "account_changed".
        boolean changed = !user.coachId().equals(u.coachId) || !user.role().equals(u.role);
        if (changed && !isRefresh(request)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "account_changed", user.isStudioCoach() && !user.coachId().equals(u.coachId)
                    ? "你已不在這個工作室，請重新登入"
                    : "你的帳號身分已變更");
        }
        if (Boolean.FALSE.equals(u.emailVerified) && !BEFORE_VERIFYING.contains(path(request))) {
            throw new ApiException(HttpStatus.FORBIDDEN, "email_unverified", "請先到信箱點連結完成 Email 驗證");
        }
        return user;
    }

    private static String path(NativeWebRequest request) {
        HttpServletRequest http = request.getNativeRequest(HttpServletRequest.class);
        return http == null ? "" : http.getRequestURI();
    }

    private static boolean isRefresh(NativeWebRequest request) {
        HttpServletRequest http = request.getNativeRequest(HttpServletRequest.class);
        return http != null && "POST".equals(http.getMethod()) && "/api/auth/refresh".equals(http.getRequestURI());
    }
}
