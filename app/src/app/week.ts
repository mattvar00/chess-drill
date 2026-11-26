/**
 * Le plan de la semaine : trois étapes tirées de « Ce qui te coûte des points », fixées le lundi pour toute la semaine.
 * Chaque étape est un exercice dont on sait dire s'il est fait : un cycle de fautes terminé (son nom dans l'historique),
 * ou une série de positions à conclure.
 */
import { insights } from './insights';
import { REP, save, store, woodHistory } from './store';

export interface WeekStep { id: string; title: string; sub: string; href: string; label?: string; need?: number }
interface Week { key: string; steps: WeekStep[]; conv: number; v?: number }
const V = 2;
const DAY = 864e5;
/** Le lundi de la semaine en cours (heure locale), comme clé. */
export function weekKey(now = Date.now()): string { const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
const st = () => store.state as typeof store.state & { week?: Week };

function build(): WeekStep[] {
  const games = store.games.filter(g => !store.state.ignored[g.id] && Date.now() / 1000 - g.t < 60 * 86400), { cost } = insights(games), steps: WeekStep[] = [];
  for (const c of cost) {
    if (c.href.startsWith('#/o/')) { const sys = c.href.slice(4), bloc = REP.blocs.find(b => b.systemes.some(x => x.id === sys));   // l'étape lance ce qu'elle annonce : les fautes de ce groupe d'ouvertures
      steps.push({ id: 'open', title: c.title.replace(/ : \d+ %$/, ''), sub: '10 de tes fautes dans ces ouvertures', href: `#/wood?o=${(bloc?.systemes.map(x => x.id) ?? [sys]).join(',')}&r=%23%2F` }); }
    else if (c.href === '#/conclure') steps.push({ id: 'conv', title: 'Conclure tes parties gagnées', sub: '5 positions contre le moteur', href: '#/conclure', need: 5 });
    else if (c.href.startsWith('#/wood')) steps.push({ id: 'fault', title: c.title.replace('Ta faute n°1 : ', 'Ta faute n°1, '), sub: '10 positions de tes parties', href: c.href.replace('%23%2Fprogres', '%23%2F'), label: c.href.includes('g=prise') ? 'Pièces en prise' : undefined });
  }
  if (!steps.some(s => s.id === 'fault')) steps.push({ id: 'fault', title: 'Tes positions prioritaires', sub: '10 positions de tes parties', href: '#/wood?r=%23%2F', label: 'Positions prioritaires' });
  return steps.slice(0, 3);
}
/** La semaine en cours (créée le premier jour où l'app est ouverte). */
export function currentWeek(): Week {
  const s = st(), key = weekKey();
  if (!s.week || s.week.key !== key || !s.week.steps.length || s.week.v !== V) { s.week = { key, steps: build(), conv: s.week?.key === key ? s.week.conv : 0, v: V }; save(); }
  return s.week;
}
/** Une étape est faite quand son exercice a été terminé depuis lundi. */
export function stepDone(w: Week, x: WeekStep): boolean {
  const since = new Date(w.key + 'T00:00:00').getTime() - DAY / 2;
  if (x.id === 'conv') return w.conv >= (x.need ?? 5);
  const done = woodHistory().filter(c => c.date >= since);
  if (x.id === 'open') return done.some(c => c.label.startsWith('Fautes : '));
  return done.some(c => (x.label ? c.label === x.label : c.label !== 'Plan du jour' && c.label !== 'Séance du jour' && !c.label.startsWith('Fautes : ')));
}
/** Une position à conclure jouée jusqu'au bout compte pour l'étape de la semaine. */
export function countConvert() { const w = currentWeek(); w.conv++; save(); }
