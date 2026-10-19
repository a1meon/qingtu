package main

import "testing"

func TestResizeOppositeEdgeStaysAnchoredAtMinimum(t *testing.T) {
	initial := windowRect{100, 200, 900, 800}
	for _, c := range []struct {
		edge   string
		dx, dy int32
		want   windowRect
	}{
		{"w", 700, 0, windowRect{300, 200, 900, 800}},
		{"nw", 700, 700, windowRect{300, 380, 900, 800}},
		{"se", -700, -700, windowRect{100, 200, 700, 620}},
		{"ne", 200, -100, windowRect{100, 100, 1100, 800}},
		{"s", 0, 100, windowRect{100, 200, 900, 900}},
	} {
		got, err := resizedWindowRect(initial, c.edge, c.dx, c.dy, 600, 420)
		if err != nil || got != c.want {
			t.Fatalf("%s: got %+v, %v; want %+v", c.edge, got, err, c.want)
		}
	}
	if _, err := resizedWindowRect(initial, "invalid", 1, 1, 600, 420); err == nil {
		t.Fatal("unknown edge accepted")
	}
}

func TestRoundShapeTracksDPIAndClearsAtMaximize(t *testing.T) {
	for _, c := range []struct {
		dpi  int32
		max  bool
		want int32
	}{{96, false, 12}, {144, false, 18}, {192, false, 24}, {144, true, 0}} {
		if got := windowCornerRadius(c.dpi, c.max); got != c.want {
			t.Fatalf("dpi %d max %v: got %d want %d", c.dpi, c.max, got, c.want)
		}
	}
}
