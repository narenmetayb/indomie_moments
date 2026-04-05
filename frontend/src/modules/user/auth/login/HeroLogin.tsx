import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAppDispatch, useRequestOtpMutation, verifyUserOtpThunk } from "@/store";

import { Decorations } from "../../../common/components/Decorations";
import { toast } from "react-toastify";

/** Strip everything except digits */
const digitsOnly = (v: string) => v.replace(/\D/g, "");

/** Validate 10-digit Nigerian phone numbers */
const isValid10Digits = (phone: string) => /^\d{10}$/.test(digitsOnly(phone));

interface LoginProps {
  onSwitch?: () => void;
}

export const HeroLogin = ({ onSwitch }: LoginProps) => {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const otpInputRef = useRef<HTMLInputElement>(null);

  const [requestOtp, { isLoading: sendingOtp }] = useRequestOtpMutation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const message = params.get("message");
    const phoneFromUrl = params.get("phone");
    if (phoneFromUrl) setPhone(decodeURIComponent(phoneFromUrl));
    if (message) {
      const decoded = decodeURIComponent(message);
      toast.info(decoded);
      setInlineMessage(decoded);
      params.delete("message");
      const nextSearch = params.toString();
      navigate(nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, navigate]);

  // Auto-focus OTP input when step changes
  useEffect(() => {
    if (step === "otp" && otpInputRef.current) {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [step]);

  const handleSubmitPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = digitsOnly(phone);
    if (!isValid10Digits(cleaned)) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }

    try {
      setInlineMessage(null);
      await requestOtp({ phoneNumber: cleaned }).unwrap();
      toast.success("OTP sent! Please check your phone");
      setStep("otp");
    } catch (err: any) {
      const message: string | undefined = err?.data?.message;
      if (message === "This number is not registered. Please register first.") {
        const info = "This number is not registered. Please create an account to continue.";
        toast.info(info);
        setPhone(cleaned);
        setInlineMessage(info);
        onSwitch?.();
        return;
      }
      toast.error(message || "We couldn't send the OTP. Please try again later.");
    }
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = digitsOnly(e.target.value).slice(0, 6);
    setOtp(value);
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      toast.error("Please enter the 6-digit OTP");
      return;
    }

    setIsVerifying(true);
    try {
      await dispatch(verifyUserOtpThunk({ phoneNumber: digitsOnly(phone), code: otp })).unwrap();
      toast.success("Login successful 🎉 Welcome back!");
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const e = err as { data?: { message?: string } };
      toast.error(e?.data?.message || "Invalid or expired OTP. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && otp.length === 6) {
      handleVerifyOTP();
    }
  };

  return (
    <div className="relative flex items-center justify-center overflow-hidden">
      {/* Background decorations */}
      <Decorations />

      {/* Main container */}
      <div className="relative w-full z-10">
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-10 relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-3xl font-black mb-2">
              <span className="text-[#E2231A]">INDO</span>
              <span className="text-[#FFD700]">MIE</span>
            </div>
            <h1 className="text-2xl font-bold mb-2 text-black">Welcome Back!</h1>
            <p className="text-gray-600 text-sm">Login to continue</p>
          </div>

          {inlineMessage && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm text-center">
              {inlineMessage}
            </div>
          )}

          {/* PHONE STEP */}
          {step === "phone" && (
            <>
              <form onSubmit={handleSubmitPhone} className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-700">Phone Number</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-4 bg-gray-100 border-2 border-r-0 border-gray-200 rounded-l-lg text-gray-600 font-semibold select-none">
                      +234
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(digitsOnly(e.target.value).slice(0, 10))}
                      required
                      placeholder="8012345678"
                      className="w-full py-3 px-4 border-2 border-l-0 border-gray-200 rounded-r-lg text-black outline-none transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={sendingOtp}
                  className="w-full bg-[#E2231A] hover:bg-[#c41e16] disabled:bg-gray-400 transition text-white py-4 rounded-full font-bold flex justify-center items-center gap-2 shadow-lg shadow-red-200"
                >
                  {sendingOtp ? "Sending..." : "Send Code"}
                  <LogIn size={18} />
                </button>

                {/* OR Divider */}
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-gray-200"></div>
                  <span className="flex-shrink mx-4 text-gray-400 text-xs font-bold uppercase tracking-wider">
                    Or sign in with
                  </span>
                  <div className="flex-grow border-t border-gray-200"></div>
                </div>

                {/* Social Logins */}
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = `${import.meta.env.VITE_API_BASE_URL}/auth/google`;
                    }}
                    className="flex items-center justify-center gap-2 py-3 px-4 border-2 border-gray-100 rounded-xl hover:bg-gray-50 transition-all font-semibold text-sm text-gray-700 cursor-pointer"
                  >
                    <svg className="w-5 h-5 font-bold" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Google
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = `${import.meta.env.VITE_API_BASE_URL}/auth/facebook`;
                    }}
                    className="flex items-center justify-center gap-2 py-3 px-4 border-2 border-[#1877F2] bg-[#1877F2] hover:bg-[#166fe5] rounded-xl transition-all font-semibold text-sm text-white shadow-md shadow-blue-100 cursor-pointer"
                  >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    Facebook
                  </button>
                </div>
              </form>

              <div className="flex items-center justify-center gap-2 mt-5 text-sm text-gray-600">
                <p>New to Indomie?</p>
                <span onClick={onSwitch} className="text-[#E2231A] font-semibold cursor-pointer hover:underline">
                  Register
                </span>
              </div>
            </>
          )}

          {/* OTP STEP */}
          {step === "otp" && (
            <>
              <div className="text-center mb-6">
                <p className="text-gray-600">Code sent to</p>
                <p className="font-bold text-black">+234 {phone}</p>
              </div>

              {/* Hidden input for OTP - this is the key */}
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={handleOtpChange}
                onKeyDown={handleKeyDown}
                placeholder="000000"
                className="absolute opacity-0 w-0 h-0 pointer-events-none"
                autoComplete="one-time-code"
              />

              {/* Visual OTP display */}
              <div 
                className="flex justify-center gap-3 mb-8 cursor-text"
                onClick={() => otpInputRef.current?.focus()}
              >
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <div
                    key={index}
                    className={`w-12 h-14 rounded-lg border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                      otp[index]
                        ? "border-black  text-black"
                        : index === otp.length
                        ? "border-[#E2231A] bg-white text-black"
                        : "border-gray-300 bg-white text-black"
                    }`}
                  >
                    {otp[index] || ""}
                  </div>
                ))}
              </div>

              <button
                onClick={handleVerifyOTP}
                disabled={isVerifying || otp.length !== 6}
                className="w-full bg-[#E2231A] hover:bg-[#c41e16] disabled:bg-gray-400 text-white py-4 rounded-full font-bold transition"
              >
                {isVerifying ? "Verifying..." : "Verify & Login"}
              </button>

              <div className="flex items-center justify-center gap-2 mt-5 text-sm text-gray-600">
                <p>Didn't receive code?</p>
                <span 
                  onClick={() => setStep("phone")} 
                  className="text-[#E2231A] font-semibold cursor-pointer hover:underline"
                >
                  Try again
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
