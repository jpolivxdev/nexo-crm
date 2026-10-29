import { type PointerEvent, useState } from 'react';
import { localDateLabel, shortDate } from '../lib/format';
import type { DailyCount } from '../lib/types';

/**
 * Gráfico de área por dia: horários marcados (área cheia) e atendimentos realizados (linha
 * tracejada). As duas séries se separam pela forma, não só pela cor, e os números ficam
 * escritos na legenda do dia e numa tabela para leitor de tela.
 * SVG próprio, sem biblioteca: a CSP do painel não aceita a tag <style> que o recharts/shadcn
 * injetam, e o gráfico é pequeno o bastante para não precisar de uma.
 */

const W = 600;
const H = 180;
const PAD_TOP = 8;

function points(values: number[], max: number): string {
  const step = values.length > 1 ? W / (values.length - 1) : 0;
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(H - (v / max) * (H - PAD_TOP)).toFixed(1)}`)
    .join(' ');
}

export function TrendChart({ data, title }: { data: DailyCount[]; title: string }) {
  // Sem interação, a legenda mostra o último dia (hoje).
  const [active, setActive] = useState<number | null>(null);
  if (data.length === 0) return null;

  const max = Math.max(1, ...data.map((d) => Math.max(d.booked, d.done)));
  const booked = points(
    data.map((d) => d.booked),
    max,
  );
  const done = points(
    data.map((d) => d.done),
    max,
  );
  const index = active ?? data.length - 1;
  const day = data[index]!;
  const x = data.length > 1 ? (index * W) / (data.length - 1) : 0;
  const totalBooked = data.reduce((s, d) => s + d.booked, 0);
  const totalDone = data.reduce((s, d) => s + d.done, 0);

  function onMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setActive(Math.round(ratio * (data.length - 1)));
  }

  return (
    <figure className="trend">
      <figcaption className="trend__head">
        <span className="trend__readout">
          <strong>{shortDate(day.date)}</strong>
          <span>
            <i className="trend__key trend__key--booked" aria-hidden="true" />
            {day.booked} {day.booked === 1 ? 'marcado' : 'marcados'}
          </span>
          <span>
            <i className="trend__key trend__key--done" aria-hidden="true" />
            {day.done} {day.done === 1 ? 'realizado' : 'realizados'}
          </span>
        </span>
        <span className="muted small">
          No período: {totalBooked} marcados · {totalDone} realizados
        </span>
      </figcaption>

      <div className="trend__plot">
        <span className="trend__max muted" aria-hidden="true">
          {max}
        </span>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="trend__svg"
          aria-hidden="true"
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
        >
          <line className="trend__grid" x1="0" x2={W} y1={PAD_TOP} y2={PAD_TOP} />
          <line
            className="trend__grid"
            x1="0"
            x2={W}
            y1={(H + PAD_TOP) / 2}
            y2={(H + PAD_TOP) / 2}
          />
          <line className="trend__grid trend__grid--base" x1="0" x2={W} y1={H} y2={H} />
          <polygon className="trend__area" points={`0,${H} ${booked} ${W},${H}`} />
          <polyline className="trend__line trend__line--booked" points={booked} />
          <polyline className="trend__line trend__line--done" points={done} />
          <line className="trend__cursor" x1={x} x2={x} y1={PAD_TOP} y2={H} />
        </svg>
      </div>
      <div className="trend__axis muted" aria-hidden="true">
        <span>{shortDate(data[0]!.date)}</span>
        {data.length > 2 && <span>{shortDate(data[Math.floor(data.length / 2)]!.date)}</span>}
        <span>{shortDate(data[data.length - 1]!.date)}</span>
      </div>

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Marcados</th>
            <th scope="col">Realizados</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{localDateLabel(d.date)}</th>
              <td>{d.booked}</td>
              <td>{d.done}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
