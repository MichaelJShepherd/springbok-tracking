import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MatchTimeline } from './match-timeline';

describe('MatchTimeline', () => {
  let component: MatchTimeline;
  let fixture: ComponentFixture<MatchTimeline>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatchTimeline]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MatchTimeline);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
