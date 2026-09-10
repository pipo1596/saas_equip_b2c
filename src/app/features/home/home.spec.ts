import { TestBed } from '@angular/core/testing';
import { Home } from './home';

describe('Home', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(Home);
    const home = fixture.componentInstance;
    expect(home).toBeTruthy();
  });
});
