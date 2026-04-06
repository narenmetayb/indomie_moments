import { HOW_WORKS_DECORATIONS, HOW_WORKS_STEPS } from "./constant/howWorks.constants";

const HowWorks = () => {
  return (
    <section className="py-16 md:py-24 relative overflow-hidden">
      {/* Decorations */}
      {HOW_WORKS_DECORATIONS.map((item, i) => {
        const Deco = item.component;
        return <Deco key={i} className={item.className} />;
      })}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">
            How Does It Work?
          </h2>
          <p className="text-lg sm:text-xl text-gray-600">
            4 easy steps to become a winner!
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-8 relative">
          {/* Connector line (desktop only) */}
          <svg
            className="hidden md:block absolute left-0 w-full h-16 pointer-events-none"
            viewBox="0 0 1000 64"
            preserveAspectRatio="none"
            style={{ top: "32px", transform: "translateY(-50%)", zIndex: 0 }}
          >
            <path
              d="M 80 32 Q 180 10, 280 32 T 480 32 T 680 32 T 920 32"
              fill="none"
              stroke="#FFD700"
              strokeWidth="4"
              strokeDasharray="8 8"
              opacity="0.5"
            />
          </svg>

          {/* Steps */}
          {HOW_WORKS_STEPS.map((step, i) => {
            const Icon = step.icon;

            return (
              <div key={i} className="text-center relative z-10 group cursor-pointer">
                {/* Floating Preview Card (Animated Popup) */}
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-4 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:-translate-y-2 group-hover:pointer-events-auto transform transition-all duration-300 ease-out z-50">
                  <div className="text-left">
                    <div className="text-xs font-bold text-primary mb-2 uppercase tracking-wide border-b pb-1 border-gray-100">
                      {step.previewContent.title}
                    </div>
                    {/* Mock UI blocks based on type to simulate "how page looks" */}
                    <div className="space-y-2 mt-2">
                      {step.previewContent.details.map((detail, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-md p-1.5 border border-gray-100">
                          <span className="truncate">{detail}</span>
                        </div>
                      ))}
                      {/* little dummy skeleton button */}
                      <div className="h-6 w-full bg-secondary/80 rounded-md mt-2 flex items-center justify-center">
                         <span className="w-8 h-1.5 bg-white/50 rounded-full"></span>
                      </div>
                    </div>
                  </div>
                  {/* Triangle Arrow below the popup */}
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-transparent border-t-white drop-shadow-md"></div>
                </div>

                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mx-auto mb-4 shadow-lg transform transition-transform duration-300 group-hover:scale-110
                    ${
                      step.highlight
                        ? "bg-[#FFD700] ring-4 ring-[#FFD700]/30 animate-pulse"
                        : "bg-white border-2 border-[#E2231A]"
                    }`}
                >
                  {step.step}
                </div>

                {Icon && (
                  <Icon className="absolute -top-2 -right-2 w-10 h-10 rotate-45 animate-bounce-slow" />
                )}

                <h3 className="text-lg sm:text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                  {step.title}
                </h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HowWorks;
