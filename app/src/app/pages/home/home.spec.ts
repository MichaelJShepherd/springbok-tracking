import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Home } from './home';
import { SupabaseService } from '../../core/supabase.service';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  function configureWith(supabaseStub: Partial<SupabaseService>) {
    return TestBed.configureTestingModule({
      imports: [Home],
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    }).compileComponents();
  }

  it('renders the matches count once Supabase resolves', async () => {
    const stub = {
      client: {
        from: () => ({
          select: () => Promise.resolve({ count: 3, error: null }),
        }),
      },
    } as unknown as SupabaseService;

    await configureWith(stub);
    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.state()).toBe('loaded');
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.count')?.textContent).toContain('3 matches');
  });

  it('renders an honest error state instead of throwing when Supabase is unreachable', async () => {
    const stub = {
      client: {
        from: () => ({
          select: () => Promise.reject(new Error('fetch failed')),
        }),
      },
    } as unknown as SupabaseService;

    await configureWith(stub);
    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.state-failed')?.textContent).toContain('temporarily');
  });
});
