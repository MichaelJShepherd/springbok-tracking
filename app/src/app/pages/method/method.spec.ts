import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Method } from './method';

describe('Method', () => {
  let fixture: ComponentFixture<Method>;
  let html: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Method],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Method);
    fixture.detectChanges();
    html = fixture.nativeElement as HTMLElement;
  });

  it('states the exact closed five-label sentiment vocabulary (D2), and nothing else', () => {
    const vocabText = html.querySelector('[data-testid="vocabulary"]')?.textContent ?? '';
    for (const label of ['Despair', 'Grumbling', 'Mixed', 'Upbeat', 'Euphoric']) {
      expect(vocabText).toContain(label);
    }
    // No sixth label may sneak in - the vocabulary is closed (D2).
    const items = html.querySelectorAll('[data-testid="vocabulary"] li');
    expect(items.length).toBe(5);
  });

  it('states the D2 minimum-volume rule with its exact thresholds', () => {
    expect(html.textContent).toContain('25 comments');
    expect(html.textContent).toContain('5 articles');
    expect(html.textContent).toContain('too little discussion to score');
  });

  it('explains both principle-2 carve-outs by name (D5 derived facts, D28 API facts)', () => {
    expect(html.textContent).toContain('Derived facts');
    expect(html.textContent).toContain('API-provided facts');
    expect(html.textContent).toContain('computed');
  });

  it('explains the CC BY-SA attribution requirement (D26)', () => {
    expect(html.textContent).toContain('CC BY-SA 4.0');
    expect(html.textContent).toContain('parsed and normalised from wikitext');
  });
});
