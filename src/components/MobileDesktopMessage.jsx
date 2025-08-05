import React from 'react';

const MobileDesktopMessage = () => {
  return (
    <div className="xl:hidden flex items-center justify-center min-h-screen bg-neutral-950 p-6">
      <div className="text-center max-w-sm">
        <div className="mb-8">
          <div className="w-16 h-16 bg-lime-400/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🖥️</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">
            Desktop Only
          </h2>
          <p className="text-neutral-400 leading-relaxed">
            This feature works best on desktop! Please switch to a computer for the full Lungo AI experience.
          </p>
        </div>
        <div className="space-y-3 text-sm text-neutral-500">
          <div className="flex items-center justify-center gap-2">
            <span>🎯</span>
            <span>Precision tools</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span>⚡</span>
            <span>Faster workflows</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span>🖱️</span>
            <span>Better controls</span>
          </div>
        </div>
        <div className="mt-8 p-4 bg-neutral-900/50 rounded-xl border border-neutral-800">
          <p className="text-xs text-neutral-500">
            We're working on mobile support! 📱✨
          </p>
        </div>
      </div>
    </div>
  );
};

export default MobileDesktopMessage;