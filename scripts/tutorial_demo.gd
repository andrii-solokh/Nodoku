extends Control

signal step_completed(step: int)

const THEME_CLASSIC := 0
const THEME_WARM := 1
const THEME_TERMINAL := 2

@export var circle_color: Color = Color("#4A5A5E")
@export var dot_color: Color = Color("#2F3E46")
@export var line_color: Color = Color("#4A5A5E")
@export var fill_color: Color = Color("#F4F1EC")
@export var selected_color: Color = Color("#C1A66A")
@export var layer_count: int = 4
@export var layer_spacing: float = 18.0
@export var rotation_lerp: float = 6.0
const DEPTH_BLUR_STEPS := 5
const TEMP_DISABLE_BLUR := false
const WEB_DISABLE_AMBIENT_ANIMATION := true
const WEB_DISABLE_DEPTH_BLUR := true

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
var current_theme_id: int = THEME_CLASSIC
var demo_time: float = 0.0
var demo_glow_texture: Texture2D = null

func _ready() -> void:
	set_process(is_visible_in_tree())
	apply_theme(THEME_CLASSIC)

func _notification(what: int) -> void:
	if what == NOTIFICATION_VISIBILITY_CHANGED:
		set_process(is_visible_in_tree())
		if is_visible_in_tree():
			queue_redraw()

func _ambient_animation_enabled() -> bool:
	if WEB_DISABLE_AMBIENT_ANIMATION and OS.has_feature("web"):
		return false
	return true

func _depth_blur_disabled() -> bool:
	return TEMP_DISABLE_BLUR or (WEB_DISABLE_DEPTH_BLUR and OS.has_feature("web"))

func apply_theme(theme_id: int) -> void:
	current_theme_id = clampi(theme_id, THEME_CLASSIC, THEME_TERMINAL)
	match current_theme_id:
		THEME_WARM:
			circle_color = Color("#EEA85C")
			dot_color = Color("#1C1A19")
			line_color = Color("#F4AE61")
			fill_color = Color("#111A28")
			selected_color = Color("#FFEBC6")
		THEME_TERMINAL:
			circle_color = Color("#65D47E")
			dot_color = Color("#081209")
			line_color = Color("#93FFAE")
			fill_color = Color("#050B06")
			selected_color = Color("#D7FFDF")
		_:
			circle_color = Color("#4A5A5E")
			dot_color = Color("#2F3E46")
			line_color = Color("#4A5A5E")
			fill_color = Color("#F4F1EC")
			selected_color = Color("#C1A66A")
	queue_redraw()

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
	if not is_visible_in_tree():
		return
	var dirty := false
	if _ambient_animation_enabled():
		demo_time += delta
		dirty = true
	if line_t != line_target:
		line_t = move_toward(line_t, line_target, delta * 3.0)
		dirty = true
	var prev_rot := rotation_vec
	rotation_vec = rotation_vec.lerp(rotation_target, clampf(delta * rotation_lerp, 0.0, 1.0))
	if rotation_vec.distance_to(prev_rot) > 0.0001:
		dirty = true
	if dirty:
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
	_draw_demo_background(rect.size)
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
		var blur_strength: float = 0.0 if _depth_blur_disabled() else clampf(pow(depth, 1.05), 0.0, 1.0)
		var pos_offset: Vector2 = offset * i
		var is_front: bool = i == 0
		_draw_demo_node(left + pos_offset, r, left_dots, selected_left and is_front, alpha, blur_strength)
		_draw_demo_node(right + pos_offset, r, right_dots, false, alpha, blur_strength)
		if line_t > 0.0 and is_front:
			_draw_demo_line(left, right, r, line_t, line_t)

func _draw_demo_background(size: Vector2) -> void:
	match current_theme_id:
		THEME_WARM:
			_draw_demo_warm_background(size)
		THEME_TERMINAL:
			_draw_demo_terminal_background(size)
		_:
			_draw_demo_classic_background(size)

func _draw_demo_classic_background(size: Vector2) -> void:
	draw_rect(Rect2(Vector2.ZERO, size), fill_color)
	var top_light := Color("#FFFFFF")
	top_light.a = 0.038
	_draw_demo_soft_radial(Vector2(size.x * 0.5, size.y * 0.16), minf(size.x, size.y) * 0.8, top_light, 8)
	var band := Color("#E8E4DC")
	band.a = 0.3
	draw_rect(Rect2(0.0, size.y * 0.64, size.x, size.y * 0.2), band)
	for i in range(44):
		var fi := float(i)
		var dust := Color("#A29A8D")
		dust.a = lerpf(0.01, 0.04, _demo_hash01(fi * 1.97 + 0.5))
		draw_circle(
			Vector2(size.x * _demo_hash01(fi * 10.31 + 0.2), size.y * _demo_hash01(fi * 17.83 + 1.6)),
			lerpf(0.4, 1.0, _demo_hash01(fi * 0.79 + 0.9)),
			dust
		)
	var vignette := Color("#9D9384")
	vignette.a = 0.03
	_draw_demo_vignette(size, vignette, 9, 1.4)

func _draw_demo_warm_background(size: Vector2) -> void:
	draw_rect(Rect2(Vector2.ZERO, size), fill_color)
	var glow := Color("#A6632B")
	glow.a = 0.02
	_draw_demo_soft_radial(Vector2(size.x * 0.5, size.y * 0.42), minf(size.x, size.y) * 0.68, glow, 9)
	var ember := Color("#FFBE72")
	ember.a = 0.02
	_draw_demo_wisp_trail(size, 2.0, ember, minf(size.x, size.y) * 0.09, 0.11)
	_draw_demo_wisp_trail(size, 6.8, ember, minf(size.x, size.y) * 0.07, -0.09)
	for i in range(62):
		var fi := float(i)
		var twinkle := 0.5 + 0.5 * sin(demo_time * 1.8 + fi * 0.37)
		var star := Color("#F6BE79")
		star.a = lerpf(0.02, 0.12, _demo_hash01(fi * 0.83 + 0.4)) * twinkle
		draw_circle(
			Vector2(size.x * _demo_hash01(fi * 13.7 + 1.7), size.y * _demo_hash01(fi * 27.2 + 3.1)),
			lerpf(0.7, 1.6, _demo_hash01(fi * 1.41 + 0.2)),
			star
		)
	var vignette := Color("#3B2516")
	vignette.a = 0.048
	_draw_demo_vignette(size, vignette, 10, 1.5)

func _draw_demo_terminal_background(size: Vector2) -> void:
	draw_rect(Rect2(Vector2.ZERO, size), fill_color)
	var core := Color("#62F089")
	core.a = 0.02
	_draw_demo_soft_radial(Vector2(size.x * 0.5, size.y * 0.45), minf(size.x, size.y) * 0.66, core, 9)
	for y in range(0, int(size.y), 4):
		var scan := Color("#0A2A12")
		scan.a = 0.16
		draw_line(Vector2(0.0, float(y)), Vector2(size.x, float(y)), scan, 1.0)
	for y in range(0, int(size.y), 24):
		var row := Color("#123C1E")
		row.a = 0.07
		draw_line(Vector2(0.0, float(y)), Vector2(size.x, float(y)), row, 1.0)
	var grid := Color("#1E5E33")
	grid.a = 0.1
	var grid_top := size.y * 0.56
	for x_step in range(0, 11):
		var tx := float(x_step) / 10.0
		var x := size.x * tx
		draw_line(Vector2(x, grid_top), Vector2(x, size.y), grid, 1.0)
	var stream := Color("#7DF89A")
	stream.a = 0.016
	_draw_demo_wisp_trail(size, 4.0, stream, minf(size.x, size.y) * 0.06, 0.08)
	for i in range(84):
		var fi := float(i)
		var twinkle := 0.5 + 0.5 * sin(demo_time * 1.6 + fi * 0.33)
		var star := Color("#77E88E")
		star.a = lerpf(0.02, 0.09, _demo_hash01(fi * 0.79 + 0.4)) * twinkle
		draw_circle(
			Vector2(size.x * _demo_hash01(fi * 11.9 + 1.7), size.y * _demo_hash01(fi * 20.6 + 3.1)),
			1.0,
			star
		)
	var vignette := Color("#001505")
	vignette.a = 0.052
	_draw_demo_vignette(size, vignette, 10, 1.4)

func _draw_demo_soft_radial(center: Vector2, radius: float, color: Color, layers: int) -> void:
	if radius <= 0.1 or color.a <= 0.001:
		return
	var count := maxi(1, layers)
	for i in range(count, 0, -1):
		var t := float(i) / float(count)
		var c := color
		c.a *= t * t
		draw_circle(center, radius * t, c)

func _draw_demo_vignette(size: Vector2, color: Color, rings: int, width: float) -> void:
	if color.a <= 0.001:
		return
	var count := maxi(1, rings)
	var max_inset := minf(size.x, size.y) * 0.2
	for i in range(count):
		var t := float(i + 1) / float(count)
		var inset := max_inset * t
		var rect_size := size - Vector2.ONE * inset * 2.0
		if rect_size.x <= 2.0 or rect_size.y <= 2.0:
			break
		var c := color
		c.a *= pow(t, 1.3)
		draw_rect(Rect2(Vector2(inset, inset), rect_size), c, false, width)

func _draw_demo_wisp_trail(size: Vector2, seed: float, color: Color, thickness: float, arc_scale: float) -> void:
	if color.a <= 0.001:
		return
	var start := Vector2(
		size.x * lerpf(0.02, 0.28, _demo_hash01(seed * 2.17 + 0.31)),
		size.y * lerpf(0.18, 0.82, _demo_hash01(seed * 1.13 + 0.91))
	)
	var end := Vector2(
		size.x * lerpf(0.66, 0.98, _demo_hash01(seed * 3.47 + 0.63)),
		size.y * lerpf(0.14, 0.86, _demo_hash01(seed * 5.73 + 0.27))
	)
	var arc := size.y * arc_scale
	var steps := 16
	for i in range(steps):
		var t := float(i) / float(steps - 1)
		var p := start.lerp(end, t)
		var sway := sin(demo_time * 0.4 + seed * 1.9 + t * TAU) * size.x * 0.012
		p.x += sway
		p.y += sin(t * PI) * arc
		var focus := sin(t * PI)
		var c := color
		c.a *= focus * focus
		var radius := thickness * lerpf(0.35, 1.0, focus)
		draw_circle(p, radius, c)

func _demo_hash01(seed: float) -> float:
	return fposmod(sin(seed) * 43758.5453, 1.0)

func _draw_demo_node(pos: Vector2, r: float, dots: int, selected: bool, alpha: float, blur_strength: float) -> void:
	if blur_strength > 0.02:
		_draw_demo_depth_blur(pos, r, alpha, blur_strength)
	if current_theme_id != THEME_TERMINAL:
		_draw_demo_round_node(pos, r, dots, selected, alpha, blur_strength)
		return
	_draw_demo_terminal_node(pos, r, dots, selected, alpha, blur_strength)

func _draw_demo_round_node(pos: Vector2, r: float, dots: int, selected: bool, alpha: float, blur_strength: float) -> void:
	var glow := line_color
	glow.a = alpha
	if current_theme_id == THEME_WARM:
		_draw_demo_full_glow(pos, r, glow, blur_strength)
	var fill_mix := 0.72 + blur_strength * 0.12
	if current_theme_id == THEME_WARM:
		fill_mix = 0.56 + blur_strength * 0.08
	var fill := circle_color.lerp(fill_color, fill_mix)
	if current_theme_id == THEME_WARM:
		fill = fill.lerp(Color("#FFC67A"), 0.16)
	fill.a = alpha
	var outline := circle_color
	outline.a *= alpha
	var dot := dot_color
	dot.a *= alpha
	outline = outline.lerp(fill_color, blur_strength * 0.38)
	dot = dot.lerp(fill_color, blur_strength * 0.16)
	draw_circle(pos, maxf(2.0, r - maxf(1.0, r * 0.12)), fill)
	if current_theme_id == THEME_WARM:
		var core := fill.lerp(Color("#FFF0C6"), 0.28)
		core.a *= alpha * 0.82
		draw_circle(pos, maxf(2.0, r * 0.8), core)
		var hot := Color("#FFF9E8")
		hot.a = alpha * lerpf(0.07, 0.18, 1.0 - blur_strength)
		draw_circle(pos, maxf(2.0, r * 0.5), hot)
	outline.a *= lerpf(1.0, 0.55 if current_theme_id == THEME_WARM else 0.42, blur_strength)
	draw_arc(pos, r, 0.0, TAU, 48, outline, maxf(1.4, r * lerpf(0.12 if current_theme_id == THEME_WARM else 0.11, 0.2 if current_theme_id == THEME_WARM else 0.18, blur_strength)))
	if selected:
		var select := selected_color
		select.a *= alpha
		draw_arc(pos, r + 3.5, 0.0, TAU, 48, select, maxf(1.4, r * 0.12))
	dot.a *= lerpf(0.95, 0.22, blur_strength)
	if dot.a > 0.02:
		_draw_demo_dots(pos, r, dots, dot)

func _draw_demo_terminal_node(pos: Vector2, r: float, dots: int, selected: bool, alpha: float, blur_strength: float) -> void:
	var glow := line_color
	glow.a = alpha
	_draw_demo_full_glow(pos, r, glow, blur_strength)
	var fill := circle_color.lerp(fill_color, 0.58 + blur_strength * 0.08)
	fill = fill.lerp(Color("#74E48A"), 0.12)
	fill.a = alpha
	var outline := circle_color
	outline.a *= alpha
	var dot := dot_color
	dot.a *= alpha
	outline = outline.lerp(fill_color, blur_strength * 0.38)
	dot = dot.lerp(fill_color, blur_strength * 0.16)
	var half := maxf(6.0, r * 0.9)
	var rect := Rect2(pos - Vector2(half, half), Vector2(half * 2.0, half * 2.0))
	draw_rect(rect, fill, true)
	var hot_rect := rect.grow(-maxf(2.0, r * 0.26))
	if hot_rect.size.x > 0.0 and hot_rect.size.y > 0.0:
		var hot := fill.lerp(Color("#D5FFDF"), 0.42)
		hot.a *= lerpf(0.48, 0.3, blur_strength)
		draw_rect(hot_rect, hot, true)
	draw_rect(rect, outline, false, maxf(1.4, r * 0.1))
	if selected:
		var select := selected_color
		select.a *= alpha
		draw_rect(rect.grow(3.5), select, false, maxf(1.4, r * 0.12))
	dot.a *= lerpf(0.95, 0.28, blur_strength)
	if dot.a > 0.02:
		_draw_demo_ascii_centered(pos, _demo_ascii_marker(dots), dot, int(clampf(r * 0.72, 12.0, 44.0)))

func _draw_demo_full_glow(pos: Vector2, r: float, color: Color, blur_strength: float) -> void:
	var tex := _ensure_demo_glow_texture()
	if tex == null:
		return
	var pulse := 0.94 + 0.06 * sin(demo_time * 3.2 + pos.x * 0.012 + pos.y * 0.01)
	var aura := color.lerp(Color.WHITE, 0.1)
	aura.a = color.a * lerpf(0.04, 0.12, 1.0 - blur_strength) * pulse
	_draw_demo_glow_sprite(tex, pos, r * lerpf(1.9, 1.55, blur_strength), aura)
	var bloom := color.lerp(Color.WHITE, 0.22)
	bloom.a = color.a * lerpf(0.03, 0.09, 1.0 - blur_strength) * pulse
	_draw_demo_glow_sprite(tex, pos, r * lerpf(1.32, 1.12, blur_strength), bloom)
	var hot_core := color.lerp(Color.WHITE, 0.66)
	hot_core.a = color.a * lerpf(0.08, 0.2, 1.0 - blur_strength) * pulse
	_draw_demo_glow_sprite(tex, pos, r * 0.86, hot_core)
	var spark := Color.WHITE
	spark.a = color.a * lerpf(0.01, 0.045, 1.0 - blur_strength) * pulse
	_draw_demo_glow_sprite(tex, pos, r * 0.42, spark)

func _draw_demo_glow_sprite(tex: Texture2D, pos: Vector2, radius: float, modulate: Color) -> void:
	if tex == null:
		return
	if radius <= 0.1 or modulate.a <= 0.001:
		return
	var size := Vector2.ONE * radius * 2.0
	draw_texture_rect(tex, Rect2(pos - size * 0.5, size), false, modulate)

func _ensure_demo_glow_texture() -> Texture2D:
	if demo_glow_texture != null:
		return demo_glow_texture
	var tex_size := 128
	var image := Image.create(tex_size, tex_size, false, Image.FORMAT_RGBA8)
	var center := Vector2(float(tex_size - 1) * 0.5, float(tex_size - 1) * 0.5)
	var inv_radius := 1.0 / maxf(1.0, center.length())
	for y in range(tex_size):
		for x in range(tex_size):
			var d := (Vector2(float(x), float(y)) - center).length() * inv_radius
			var t := clampf(1.0 - d, 0.0, 1.0)
			var smooth := t * t * (3.0 - 2.0 * t)
			var a := pow(smooth, 1.9)
			image.set_pixel(x, y, Color(1.0, 1.0, 1.0, a))
	demo_glow_texture = ImageTexture.create_from_image(image)
	return demo_glow_texture

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
	var glow := c
	glow.a *= 0.24
	if current_theme_id == THEME_TERMINAL:
		var hot := c.lerp(Color("#E8FFEE"), 0.42)
		hot.a *= alpha * 0.8
		_draw_demo_dashed_line(start, end, glow, maxf(4.8, r * 0.42), maxf(8.0, r * 0.4), maxf(4.2, r * 0.2))
		_draw_demo_dashed_line(start, end, hot, maxf(1.9, r * 0.15), maxf(5.0, r * 0.24), maxf(3.0, r * 0.14))
	elif current_theme_id == THEME_WARM:
		var hot := c.lerp(Color("#FFF2D2"), 0.45)
		hot.a *= alpha * 0.82
		draw_line(start, end, glow, maxf(5.2, r * 0.46))
		draw_line(start, end, hot, maxf(2.0, r * 0.16))
	else:
		draw_line(start, end, c, maxf(2.0, r * 0.1))

func _draw_demo_dashed_line(start: Vector2, end: Vector2, color: Color, width: float, dash_len: float, gap_len: float) -> void:
	var dir := end - start
	var length := dir.length()
	if length <= 0.001:
		return
	var unit := dir / length
	var cursor := 0.0
	while cursor < length:
		var seg_end := minf(cursor + dash_len, length)
		draw_line(start + unit * cursor, start + unit * seg_end, color, width)
		cursor += dash_len + gap_len

func _demo_ascii_marker(count: int) -> String:
	if count <= 0:
		return "OK"
	return "+".repeat(clampi(count, 1, 4))

func _draw_demo_ascii_centered(pos: Vector2, text: String, color: Color, font_size: int) -> void:
	var font := ThemeDB.fallback_font
	if font == null:
		return
	var sz := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	var ascent := font.get_ascent(font_size)
	var origin := Vector2(pos.x - sz.x * 0.5, pos.y + ascent * 0.38)
	draw_string(font, origin, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)

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
