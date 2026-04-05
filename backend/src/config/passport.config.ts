import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { config } from "./env";
import { handleSocialLoginService } from "../api/v1/modules/user/auth/auth.service";
import { logger } from "../lib/logger";

// Google Strategy
if (config.social.google.clientId && config.social.google.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.social.google.clientId,
        clientSecret: config.social.google.clientSecret,
        callbackURL: config.social.google.callbackUrl,
        proxy: true,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value || "";
          const fullName = profile.displayName || "Google User";
          const avatar = profile.photos?.[0]?.value || "";
          
          const result = await handleSocialLoginService({
            email,
            fullName,
            avatar,
            googleId: profile.id,
          });

          return done(null, result);
        } catch (error) {
          logger.error("Google Auth Strategy Error", { error });
          return done(error as Error);
        }
      }
    )
  );
}

// Facebook Strategy
if (config.social.facebook.appId && config.social.facebook.appSecret) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: config.social.facebook.appId,
        clientSecret: config.social.facebook.appSecret,
        callbackURL: config.social.facebook.callbackUrl,
        profileFields: ["id", "displayName", "emails", "photos"],
        proxy: true,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value || "";
          const fullName = profile.displayName || "Facebook User";
          const avatar = profile.photos?.[0]?.value || "";
          
          const result = await handleSocialLoginService({
            email,
            fullName,
            avatar,
            facebookId: profile.id,
          });

          return done(null, result);
        } catch (error) {
          logger.error("Facebook Auth Strategy Error", { error });
          return done(error as Error);
        }
      }
    )
  );
}

// Session (Needed by Passport, but we use JWTs)
passport.serializeUser((user: any, done) => {
  done(null, user);
});

passport.deserializeUser((user: any, done) => {
  done(null, user);
});

export default passport;
