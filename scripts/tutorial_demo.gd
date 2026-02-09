extends Control

signal step_completed(step: int)

@export var circle_color: Color = Color(0.25, 0.3, 0.32, 1.0)
@export var dot_color: Color = Color(0.2, 0.26, 0.28, 1.0)
@export var line_color: Color = Color(0.32, 0.4, 0.42, 1.0)
@export var fill_color: Color = Color(0.97, 0.96, 0.94, 1.0)
@export var selected_color: Color = Color(0.76, 0.65, 0.4, 1.0)
@export var layer_count: int = 4
@export var layer_spacing: float = 18.0
@export var rotation_lerp: float = 6.0
const DEPTH_BLUR_STEPS := 5

var expected_step: int = 0
var selected_left: bool = false
var connected: bool = false
var line_t: float = 0.0
var line_target: float = 0.0
var drag_active: bool = false
var drag_accum: Vector2 = Vector2.ZERO
var rotation_vec: Vector2 = Vector2(1, 1)
var rotation_target: Vector2 = Vector2(1, 1)
var rotation_triggered: bool = false

func _ready() -> void:
	set_process(true)

func reset_demo() -> void:
	expected_step = 0
	selected_left = false
	connected = false
	line_t = 0.0
	line_target = 0.0
	drag_active = false
	drag_accum = Vector2.ZERO
	rotation_vec = Vector2(1, 1)
	rotation_target = Vector2(1, 1)
	rotation_triggered = false
	queue_redraw()

func set_step(value: int) -> void:
	expected_step = value
	if expected_step == 0:
		selected_left = false
		connected = false
		line_t = 0.0
		line_target = 0.0
		rotation_triggered = false

func _process(delta: float) -> void:
	if line_t != line_target:
		line_t = move_toward(line_t, line_target, delta * 3.0)
	rotation_vec = rotation_vec.lerp(rotation_target, clampf(delta * rotation_lerp, 0.0, 1.0))
	queue_redraw()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventPanGesture:
		_apply_rotation_delta(event.delta)
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			drag_active = true
			drag_accum = Vector2.ZERO
		else:
			drag_active = false
			drag_accum = Vector2.ZERO
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_handle_tap(event.position)
	if event is InputEventScreenTouch and event.pressed:
		_handle_tap(event.position)
	if event is InputEventMouseMotion and drag_active:
		drag_accum += event.relative
		_try_rotation_from_drag(drag_accum)
	if event is InputEventScreenDrag:
		drag_accum += event.relative
		_try_rotation_from_drag(drag_accum)
	if event is InputEventKey and event.pressed:
		_try_rotation_from_keys(event.keycode)

func _handle_tap(pos: Vector2) -> void:
	var rect := get_rect()
	var center := rect.size * 0.5
	var r := minf(rect.size.x, rect.size.y) * 0.22
	var left := center + Vector2(-r * 2.1, 0)
	var right := center + Vector2(r * 2.1, 0)
	if pos.distance_to(left) <= r * 1.05:
		_on_left_tap()
		return
	if pos.distance_to(right) <= r * 1.05:
		_on_right_tap()
		return

func _on_left_tap() -> void:
	if expected_step == 0:
		selected_left = true
		emit_signal("step_completed", 0)
	elif expected_step > 0:
		selected_left = true

func _on_right_tap() -> void:
	if expected_step == 1 and selected_left and not connected:
		connected = true
		line_target = 1.0
		selected_left = false
		emit_signal("step_completed", 1)
		return
	if expected_step == 2 and connected:
		connected = false
		line_target = 0.0
		emit_signal("step_completed", 2)
		return
	if connected and expected_step >= 1:
		connected = false
		line_target = 0.0

func _try_rotation_from_drag(delta: Vector2) -> void:
	if delta.length() < 18.0:
		return
	drag_accum = Vector2.ZERO
	_apply_rotation_delta(delta)

func _try_rotation_from_keys(keycode: int) -> void:
	match keycode:
		KEY_LEFT:
			_apply_rotation_delta(Vector2(-1, 0))
		KEY_RIGHT:
			_apply_rotation_delta(Vector2(1, 0))
		KEY_UP:
			_apply_rotation_delta(Vector2(0, -1))
		KEY_DOWN:
			_apply_rotation_delta(Vector2(0, 1))
		_:
			return

func _apply_rotation_delta(delta: Vector2) -> void:
	var dir := Vector2.ZERO
	if absf(delta.x) >= absf(delta.y):
		dir = Vector2(signf(delta.x), 0)
	else:
		dir = Vector2(0, signf(delta.y))
	if dir == Vector2.ZERO:
		return
	rotation_target = dir
	if expected_step == 3 and not rotation_triggered:
		rotation_triggered = true
		emit_signal("step_completed", 3)

func _draw() -> void:
	var rect := get_rect()
	var center := rect.size * 0.5
	var r := minf(rect.size.x, rect.size.y) * 0.22
	var left := center + Vector2(-r * 2.1, 0)
	var right := center + Vector2(r * 2.1, 0)

	var left_dots := 2
	var right_dots := 2
	if connected:
		left_dots = 1
		right_dots = 1

	var layers: int = max(1, layer_count)
	var dir: Vector2 = rotation_vec
	if dir.length() < 0.01:
		dir = Vector2(1, 1)
	var offset := dir.normalized() * layer_spacing
	for i in range(layers - 1, -1, -1):
		var depth: float = float(i) / max(1.0, float(layers - 1))
		var alpha: float = lerpf(0.35, 1.0, 1.0 - depth)
		var blur_strength: float = clampf(pow(depth, 1.05), 0.0, 1.0)
		var pos_offset: Vector2 = offset * i
		var is_front: bool = i == 0
		_draw_demo_node(left + pos_offset, r, left_dots, selected_left and is_front, alpha, blur_strength)
		_draw_demo_node(right + pos_offset, r, right_dots, false, alpha, blur_strength)
		if line_t > 0.0 and is_front:
			_draw_demo_line(left, right, r, line_t, line_t)

func _draw_demo_node(pos: Vector2, r: float, dots: int, selected: bool, alpha: float, blur_strength: float) -> void:
	if blur_strength > 0.02:
		_draw_demo_depth_blur(pos, r, alpha, blur_strength)
	var fill := fill_color
	fill.a *= alpha
	var outline := circle_color
	outline.a *= alpha
	var dot := dot_color
	dot.a *= alpha
	fill = fill.lerp(fill_color, blur_strength * 0.12)
	fill = fill.lerp(Color(fill_color.r, fill_color.g, fill_color.b, fill.a), blur_strength * 0.22)
	outline = outline.lerp(fill_color, blur_strength * 0.58)
	dot = dot.lerp(fill_color, blur_strength * 0.76)
	draw_circle(pos, maxf(2.0, r - maxf(1.0, r * 0.12)), fill)
	outline.a *= lerpf(1.0, 0.42, blur_strength)
	draw_arc(pos, r, 0.0, TAU, 48, outline, maxf(1.4, r * lerpf(0.12, 0.18, blur_strength)))
	if selected:
		var select := selected_color
		select.a *= alpha
		draw_arc(pos, r + 3.5, 0.0, TAU, 48, select, maxf(1.4, r * 0.12))
	dot.a *= lerpf(1.0, 0.16, blur_strength)
	if dot.a > 0.02:
		_draw_demo_dots(pos, r, dots, dot)

func _draw_demo_depth_blur(pos: Vector2, r: float, alpha: float, blur_strength: float) -> void:
	var fog := clampf(1.0 - alpha, 0.0, 1.0)
	var base := circle_color.lerp(fill_color, lerpf(0.28, 0.68, fog))
	var layers := maxi(1, int(round(lerpf(1.0, float(DEPTH_BLUR_STEPS), blur_strength))))
	for i in range(layers, 0, -1):
		var t := float(i) / float(layers)
		var blur := base
		var max_alpha := lerpf(0.04, 0.2, blur_strength)
		blur.a = max_alpha * t
		var blur_r := r + r * lerpf(0.06, 0.48, blur_strength) * t
		draw_circle(pos, blur_r, blur)

func _draw_demo_line(a: Vector2, b: Vector2, r: float, progress: float, alpha: float) -> void:
	progress = clampf(progress, 0.0, 1.0)
	alpha = clampf(alpha, 0.0, 1.0)
	var dir := b - a
	var len := dir.length()
	if len < 0.001:
		return
	var unit := dir / len
	var start := a + unit * (r * 0.9)
	var end := b - unit * (r * 0.9)
	var mid := (start + end) * 0.5
	var half := (end - start) * 0.5 * progress
	start = mid - half
	end = mid + half
	var c := line_color
	c.a *= alpha
	draw_line(start, end, c, maxf(2.0, r * 0.12))

func _draw_demo_dots(pos: Vector2, r: float, count: int, color: Color) -> void:
	if count <= 0:
		return
	var spacing := r * 0.36
	var offsets: Array = []
	match count:
		1:
			offsets = [Vector2.ZERO]
		2:
			offsets = [Vector2(-spacing, 0.0), Vector2(spacing, 0.0)]
		3:
			offsets = [Vector2(0.0, -spacing * 0.9), Vector2(-spacing, spacing * 0.7), Vector2(spacing, spacing * 0.7)]
		_:
			offsets = [Vector2(-spacing, -spacing), Vector2(spacing, -spacing), Vector2(-spacing, spacing), Vector2(spacing, spacing)]
	var dr := maxf(2.0, r * 0.16)
	for off in offsets:
		draw_circle(pos + off, dr, color)
