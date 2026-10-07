"use client";

type Props = {
  progress: number;
  preparing: boolean;
  /** Momento (Date.now()) em que a conversão começou; null = desconhecido. */
  startedAt: number | null;
};

function fmtDur(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m <= 0) return `${s} s`;
  return `${m} min ${s.toString().padStart(2, "0")} s`;
}

export default function ConversionProgress({ progress, preparing, startedAt }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const elapsedMs = startedAt != null ? Math.max(0, Date.now() - startedAt) : 0;
  // Estimativa simples: ritmo médio até aqui projetado para o restante.
  // Só mostra a partir de 5% para não "chutar" no início.
  const showEta = !preparing && startedAt != null && pct >= 5 && pct < 100;
  const remainingMs = showEta ? (elapsedMs * (100 - pct)) / Math.max(pct, 1) : 0;

  return (
    <div className="converting" role="status" aria-live="polite">
      <p className="converting-title">
        {preparing ? "Preparando…" : "Convertendo seu vídeo"}
      </p>
      <p className="converting-pct" aria-label={`${pct} por cento`}>
        {pct}%
      </p>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Progresso da conversão"
      >
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-note">
        {startedAt != null && !preparing && (
          <>
            Tempo decorrido: {fmtDur(elapsedMs)}
            {showEta && (
              <>
                <br />
                Faltam aprox. {fmtDur(remainingMs)}
              </>
            )}
            <br />
          </>
        )}
        Vídeos longos podem levar vários minutos.
        <br />
        O vídeo está sendo processado no seu próprio dispositivo.
      </p>
    </div>
  );
}
