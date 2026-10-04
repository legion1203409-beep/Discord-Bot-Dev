import "./game-guide-loading-screen.css";
import animatedDragonLogo from "@assets/ezgif.com-video-to-gif-converter_1789791978054.gif";

export function GameGuideLoadingScreen() {
  return (
    <main
      className="game-guide-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Se încarcă ghidul jocului"
    >
      <section className="game-guide-loading__card">
        <div className="game-guide-loading__art" aria-hidden="true">
          <img src={animatedDragonLogo} alt="" decoding="async" fetchPriority="high" />
        </div>

        <h1 className="game-guide-loading__title">Se încarcă ghidul</h1>
        <div className="game-guide-loading__bar" aria-hidden="true">
          <span />
        </div>
        <p className="game-guide-loading__label">
          Se pregătește ghidul jocului
          <span className="game-guide-loading__dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      </section>
    </main>
  );
}