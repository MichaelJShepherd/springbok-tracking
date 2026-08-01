import { Component, inject, OnInit, signal } from '@angular/core';
import { SupabaseService } from '../../core/supabase.service';

type LoadState = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly supabase = inject(SupabaseService);

  readonly state = signal<LoadState>('loading');
  readonly matchesCount = signal<number | null>(null);

  ngOnInit(): void {
    this.loadMatchesCount();
  }

  private async loadMatchesCount(): Promise<void> {
    // Non-blocking UX: a failure here must never throw or leave the page
    // blank (AGENTS.md task #73 non-negotiables) — it degrades to a
    // visible-but-honest error state instead.
    try {
      const { count, error } = await this.supabase.client
        .from('matches')
        .select('*', { count: 'exact', head: true });

      if (error) {
        this.state.set('error');
        return;
      }

      this.matchesCount.set(count ?? 0);
      this.state.set('loaded');
    } catch {
      this.state.set('error');
    }
  }
}
