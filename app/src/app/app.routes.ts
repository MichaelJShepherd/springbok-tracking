import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { History } from './pages/history/history';
import { MatchDetail } from './pages/match-detail/match-detail';
import { FixtureDetail } from './pages/fixture-detail/fixture-detail';
import { MatchTimeline } from './pages/match-timeline/match-timeline';
import { Method } from './pages/method/method';

export const routes: Routes = [
  { path: '', component: Home, title: 'Springbok Tracking' },
  { path: 'history', component: History, title: 'History — Springbok Tracking' },
  { path: 'match/:id', component: MatchDetail, title: 'Match — Springbok Tracking' },
  { path: 'fixture/:id', component: FixtureDetail, title: 'Fixture — Springbok Tracking' },
  {
    path: 'match/:id/timeline',
    component: MatchTimeline,
    title: 'Match timeline — Springbok Tracking',
  },
  { path: 'method', component: Method, title: 'Method — Springbok Tracking' },
  { path: '**', redirectTo: '' },
];
