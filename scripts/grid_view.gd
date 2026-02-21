class_name GridView
extends Node2D

const THEME_CLASSIC := 0
const THEME_WARM := 1
const THEME_TERMINAL := 2

const FACE_FRONT := 0
const FACE_BACK := 1
const FACE_LEFT := 2
const FACE_RIGHT := 3
const FACE_TOP := 4
const FACE_BOTTOM := 5

const CLASSIC_BG := Color("#F4F1EC")
const CLASSIC_CIRCLE := Color("#4A5A5E")
const CLASSIC_DOT := Color("#2F3E46")
const CLASSIC_EDGE := Color("#4A5A5E")
const CLASSIC_SELECTED := Color("#C1A66A")
const CLASSIC_QUIET := Color("#DAD4CC")

const WARM_BG := Color("#090F18")
const WARM_CIRCLE := Color("#EEA85C")
const WARM_DOT := Color("#1C1A19")
const WARM_EDGE := Color("#F4AE61")
const WARM_SELECTED := Color("#FFECC8")
const WARM_QUIET := Color("#1E2A3D")

const TERMINAL_BG := Color("#040A05")
const TERMINAL_CIRCLE := Color("#66D37C")
const TERMINAL_DOT := Color("#060F08")
const TERMINAL_EDGE := Color("#91FFAB")
const TERMINAL_SELECTED := Color("#D2FFDB")
const TERMINAL_QUIET := Color("#163320")

const FADE_BACK := 0.05
const FADE_FRONT := 1.0
const PICK_FADE_MIN := 0.45
const PICK_BLUR_MAX := 0.75
const DEPTH_BLUR_STEPS := 5
const TEMP_DISABLE_BLUR := false
const WEB_DISABLE_AMBIENT_ANIMATION := false
const WEB_DISABLE_DEPTH_BLUR := true
const VFX_SHADER_BG := "shader_bg"
const VFX_EDGE_SWEEP := "edge_sweep"
const VFX_CONNECT_RIPPLE := "connect_ripple"
const VFX_HINT_BEACON := "hint_beacon"
const VFX_SOLVED_AURA := "solved_aura"
const VFX_PARALLAX_FOG := "parallax_fog"
const VFX_AMBIENT_PARTICLES := "ambient_particles"
const VFX_PHOSPHOR_TRAIL := "phosphor_trail"
const VFX_HEAT_SHIMMER := "heat_shimmer"
const VFX_COMPLETION_SHOCKWAVE := "completion_shockwave"
const VFX_DISCONNECT_DISSOLVE := "disconnect_dissolve"
const VFX_UI_LIGHT_COUPLING := "ui_light_coupling"
const DEFAULT_VFX_FLAGS := {
	VFX_SHADER_BG: true,
	VFX_EDGE_SWEEP: true,
	VFX_CONNECT_RIPPLE: true,
	VFX_HINT_BEACON: true,
	VFX_SOLVED_AURA: true,
	VFX_PARALLAX_FOG: true,
	VFX_AMBIENT_PARTICLES: true,
	VFX_PHOSPHOR_TRAIL: true,
	VFX_HEAT_SHIMMER: true,
	VFX_COMPLETION_SHOCKWAVE: true,
	VFX_DISCONNECT_DISSOLVE: true,
	VFX_UI_LIGHT_COUPLING: true
}
const DEFAULT_VFX_PROFILE := {"intensity": 1.0, "motion": 1.0}
const VFX_INTENSITY_MAX := 6.0
const VFX_MOTION_MIN := -6.0
const VFX_MOTION_MAX := 6.0
const QUALITY_AMBIENT_FPS_DEFAULT := 60.0
const QUALITY_AMBIENT_FPS_BALANCED := 15.0
const QUALITY_AMBIENT_FPS_BATTERY := 8.0
const QUALITY_PARTICLE_CAP_DEFAULT := 36
const QUALITY_PARTICLE_CAP_BALANCED := 22
const QUALITY_PARTICLE_CAP_BATTERY := 14
const QUALITY_WARM_GLOW_PASSES_DEFAULT := 4
const QUALITY_WARM_GLOW_PASSES_BALANCED := 3
const QUALITY_WARM_GLOW_PASSES_BATTERY := 2
const QUALITY_RING_ARC_DEFAULT := 48
const QUALITY_RING_ARC_BALANCED := 40
const QUALITY_RING_ARC_BATTERY := 28
const QUALITY_HINT_ARC_DEFAULT := 64
const QUALITY_HINT_ARC_BALANCED := 52
const QUALITY_HINT_ARC_BATTERY := 36
const QUALITY_COMPLETION_ARC_DEFAULT := 96
const QUALITY_COMPLETION_ARC_BALANCED := 72
const QUALITY_COMPLETION_ARC_BATTERY := 56

var cell_size: float = 96.0
var base_radius: float = 28.0

var model: GridModel: set = _set_model
var selected_id: int = -1
var hint_id: int = -1
var hint_ids: Array = []

var rotation_basis: Basis = Basis()
var rotation_active: bool = false
var rotation_duration: float = 0.35
var rotation_timeout_secs: float = 1.0
var rotation_deadline: float = 0.0
var _tween_from: Quaternion
var _tween_to: Quaternion
var dot_states: Dictionary = {}
var dot_anim_speed: float = 10.0
var edge_states: Dictionary = {}
var edge_anim_speed: float = 8.0
var float_time: float = 0.0
var float_amp_factor: float = 0.018
var float_speed: float = 0.25
var color_bg: Color = CLASSIC_BG
var color_circle: Color = CLASSIC_CIRCLE
var color_dot: Color = CLASSIC_DOT
var color_edge: Color = CLASSIC_EDGE
var color_selected: Color = CLASSIC_SELECTED
var color_quiet: Color = CLASSIC_QUIET
var current_theme_id: int = THEME_CLASSIC
var force_unsolved_white_fill: bool = false
var glow_texture: Texture2D = null
var use_shader_background: bool = false
var vfx_flags: Dictionary = DEFAULT_VFX_FLAGS.duplicate(true)
var vfx_profiles: Dictionary = {}
var edge_sweeps: Array = []
var edge_ripples: Array = []
var edge_afterimages: Array = []
var completion_waves: Array = []
var ui_light_bias: float = 0.0
var ui_light_target: float = 0.0
var solved_aura_level: float = 0.0
var vfx_intensity: float = 1.0
var vfx_motion: float = 1.0
var quality_ambient_fps: float = QUALITY_AMBIENT_FPS_DEFAULT
var quality_particle_cap: int = QUALITY_PARTICLE_CAP_DEFAULT
var quality_warm_glow_passes: int = QUALITY_WARM_GLOW_PASSES_DEFAULT
var quality_blur_layer_cap: int = DEPTH_BLUR_STEPS
var quality_ring_arc_points: int = QUALITY_RING_ARC_DEFAULT
var quality_hint_arc_points: int = QUALITY_HINT_ARC_DEFAULT
var quality_completion_arc_points: int = QUALITY_COMPLETION_ARC_DEFAULT
var quality_post_fx_policy: String = "balanced"
var ambient_tick_accum: float = 0.0

signal rotation_finished

func reset_style_palette() -> void:
	set_theme(THEME_CLASSIC)

func set_theme(theme_id: int) -> void:
	current_theme_id = clampi(theme_id, THEME_CLASSIC, THEME_TERMINAL)
	match current_theme_id:
		THEME_WARM:
			color_bg = WARM_BG
			color_circle = WARM_CIRCLE
			color_dot = WARM_DOT
			color_edge = WARM_EDGE
			color_selected = WARM_SELECTED
			color_quiet = WARM_QUIET
		THEME_TERMINAL:
			color_bg = TERMINAL_BG
			color_circle = TERMINAL_CIRCLE
			color_dot = TERMINAL_DOT
			color_edge = TERMINAL_EDGE
			color_selected = TERMINAL_SELECTED
			color_quiet = TERMINAL_QUIET
		_:
			color_bg = CLASSIC_BG
			color_circle = CLASSIC_CIRCLE
			color_dot = CLASSIC_DOT
			color_edge = CLASSIC_EDGE
			color_selected = CLASSIC_SELECTED
			color_quiet = CLASSIC_QUIET
	queue_redraw()

func set_style_palette(palette: Dictionary) -> void:
	if palette.has("bg"):
		color_bg = palette["bg"]
	if palette.has("circle"):
		color_circle = palette["circle"]
	if palette.has("dot"):
		color_dot = palette["dot"]
	if palette.has("edge"):
		color_edge = palette["edge"]
	if palette.has("selected"):
		color_selected = palette["selected"]
	if palette.has("quiet"):
		color_quiet = palette["quiet"]
	queue_redraw()

func _ensure_vfx_profile_key(key: String) -> void:
	if vfx_profiles.has(key):
		return
	vfx_profiles[key] = DEFAULT_VFX_PROFILE.duplicate(true)

func _ensure_all_vfx_profiles() -> void:
	for key in DEFAULT_VFX_FLAGS.keys():
		_ensure_vfx_profile_key(String(key))

func vfx_entries() -> Array:
	return [
		{"key": VFX_SHADER_BG, "label": "Shader Background"},
		{"key": VFX_EDGE_SWEEP, "label": "Edge Energy Sweep"},
		{"key": VFX_CONNECT_RIPPLE, "label": "Connection Ripple"},
		{"key": VFX_HINT_BEACON, "label": "Hint Beacon"},
		{"key": VFX_SOLVED_AURA, "label": "Solved Aura"},
		{"key": VFX_PARALLAX_FOG, "label": "Parallax Fog"},
		{"key": VFX_AMBIENT_PARTICLES, "label": "Ambient Particles"},
		{"key": VFX_PHOSPHOR_TRAIL, "label": "Phosphor Trail"},
		{"key": VFX_HEAT_SHIMMER, "label": "Heat Shimmer"},
		{"key": VFX_COMPLETION_SHOCKWAVE, "label": "Completion Shockwave"},
		{"key": VFX_DISCONNECT_DISSOLVE, "label": "Disconnect Dissolve"},
		{"key": VFX_UI_LIGHT_COUPLING, "label": "UI Light Coupling"}
	]

func set_vfx_enabled(key: String, enabled: bool) -> void:
	_ensure_vfx_profile_key(key)
	vfx_flags[key] = enabled
	if key == VFX_SHADER_BG:
		use_shader_background = enabled
	if not enabled:
		match key:
			VFX_EDGE_SWEEP:
				edge_sweeps.clear()
			VFX_CONNECT_RIPPLE:
				edge_ripples.clear()
			VFX_PHOSPHOR_TRAIL, VFX_DISCONNECT_DISSOLVE:
				edge_afterimages.clear()
			VFX_COMPLETION_SHOCKWAVE:
				completion_waves.clear()
			VFX_UI_LIGHT_COUPLING:
				ui_light_bias = 0.0
				ui_light_target = 0.0
	queue_redraw()

func get_vfx_enabled(key: String) -> bool:
	return _vfx_enabled(key)

func has_vfx_key(key: String) -> bool:
	return DEFAULT_VFX_FLAGS.has(key)

func set_vfx_profile_intensity(key: String, value: float) -> void:
	if not has_vfx_key(key):
		return
	_ensure_vfx_profile_key(key)
	var profile: Dictionary = vfx_profiles[key]
	profile["intensity"] = clampf(value, 0.0, VFX_INTENSITY_MAX)
	vfx_profiles[key] = profile
	queue_redraw()

func set_vfx_profile_motion(key: String, value: float) -> void:
	if not has_vfx_key(key):
		return
	_ensure_vfx_profile_key(key)
	var profile: Dictionary = vfx_profiles[key]
	profile["motion"] = clampf(value, VFX_MOTION_MIN, VFX_MOTION_MAX)
	vfx_profiles[key] = profile
	queue_redraw()

func get_vfx_profile_intensity(key: String) -> float:
	if not vfx_profiles.has(key):
		return 1.0
	var profile: Dictionary = vfx_profiles[key]
	return clampf(float(profile.get("intensity", 1.0)), 0.0, VFX_INTENSITY_MAX)

func get_vfx_profile_motion(key: String) -> float:
	if not vfx_profiles.has(key):
		return 1.0
	var profile: Dictionary = vfx_profiles[key]
	return clampf(float(profile.get("motion", 1.0)), VFX_MOTION_MIN, VFX_MOTION_MAX)

func get_vfx_flags_snapshot() -> Dictionary:
	return vfx_flags.duplicate(true)

func get_vfx_profiles_snapshot() -> Dictionary:
	return vfx_profiles.duplicate(true)

func set_ui_light_bias(strength: float) -> void:
	ui_light_target = clampf(strength, 0.0, 1.0)
	queue_redraw()

func set_vfx_intensity(value: float) -> void:
	vfx_intensity = clampf(value, 0.0, VFX_INTENSITY_MAX)
	queue_redraw()

func get_vfx_intensity() -> float:
	return vfx_intensity

func set_vfx_motion(value: float) -> void:
	vfx_motion = clampf(value, VFX_MOTION_MIN, VFX_MOTION_MAX)
	queue_redraw()

func get_vfx_motion() -> float:
	return vfx_motion

func apply_quality_settings(settings: Dictionary) -> void:
	var ambient_fps := float(settings.get("ambient_fps", quality_ambient_fps))
	var particle_cap := int(settings.get("particle_cap", quality_particle_cap))
	var glow_passes := int(settings.get("warm_glow_passes", quality_warm_glow_passes))
	var blur_layers := int(settings.get("blur_layers", quality_blur_layer_cap))
	var ring_arc := int(settings.get("ring_arc_points", quality_ring_arc_points))
	var hint_arc := int(settings.get("hint_arc_points", quality_hint_arc_points))
	var completion_arc := int(settings.get("completion_arc_points", quality_completion_arc_points))
	var post_policy := String(settings.get("post_fx_policy", quality_post_fx_policy))
	quality_ambient_fps = clampf(ambient_fps, 1.0, 240.0)
	quality_particle_cap = clampi(particle_cap, 8, 96)
	quality_warm_glow_passes = clampi(glow_passes, 1, 4)
	quality_blur_layer_cap = clampi(blur_layers, 1, DEPTH_BLUR_STEPS)
	quality_ring_arc_points = clampi(ring_arc, 16, QUALITY_RING_ARC_DEFAULT)
	quality_hint_arc_points = clampi(hint_arc, 24, QUALITY_HINT_ARC_DEFAULT)
	quality_completion_arc_points = clampi(completion_arc, 32, QUALITY_COMPLETION_ARC_DEFAULT)
	quality_post_fx_policy = post_policy
	ambient_tick_accum = 0.0
	queue_redraw()

func pulse_ui_light(strength: float = 1.0) -> void:
	ui_light_bias = maxf(ui_light_bias, clampf(strength, 0.0, 1.0))
	queue_redraw()

func trigger_edge_feedback(a: int, b: int, connected: bool) -> void:
	if model == null:
		return
	var key := model.edge_key(a, b)
	if connected and _vfx_enabled(VFX_EDGE_SWEEP):
		var sweep_motion := _vfx_speed_factor(VFX_EDGE_SWEEP)
		edge_sweeps.append({"key": key, "a": a, "b": b, "age": 0.0, "duration": 0.58 / sweep_motion})
	if _vfx_enabled(VFX_CONNECT_RIPPLE):
		var ripple_motion := _vfx_speed_factor(VFX_CONNECT_RIPPLE)
		var ripple_duration := (0.4 if connected else 0.34) / ripple_motion
		edge_ripples.append({"a": a, "b": b, "connected": connected, "age": 0.0, "duration": ripple_duration})
	if connected and _vfx_enabled(VFX_PHOSPHOR_TRAIL):
		var trail_motion := _vfx_speed_factor(VFX_PHOSPHOR_TRAIL)
		edge_afterimages.append({"a": a, "b": b, "kind": "trail", "age": 0.0, "duration": 0.85 / trail_motion})
	if not connected and _vfx_enabled(VFX_DISCONNECT_DISSOLVE):
		var dissolve_motion := _vfx_speed_factor(VFX_DISCONNECT_DISSOLVE)
		edge_afterimages.append({"a": a, "b": b, "kind": "dissolve", "age": 0.0, "duration": 0.56 / dissolve_motion})
	queue_redraw()

func trigger_completion_wave() -> void:
	if not _vfx_enabled(VFX_COMPLETION_SHOCKWAVE):
		return
	var wave_motion := _vfx_speed_factor(VFX_COMPLETION_SHOCKWAVE)
	completion_waves.append({"age": 0.0, "duration": 0.95 / wave_motion})
	queue_redraw()

func _vfx_enabled(key: String) -> bool:
	if not vfx_flags.has(key):
		return true
	return bool(vfx_flags[key])

func _vfx_intensity_factor(key: String = "") -> float:
	var master := clampf(vfx_intensity, 0.0, VFX_INTENSITY_MAX)
	if key == "":
		return master
	return master * get_vfx_profile_intensity(key)

func _vfx_motion_factor(key: String = "") -> float:
	var master := clampf(vfx_motion, VFX_MOTION_MIN, VFX_MOTION_MAX)
	if key == "":
		return master
	return master * get_vfx_profile_motion(key)

func _vfx_speed_factor(key: String = "") -> float:
	return maxf(0.05, absf(_vfx_motion_factor(key)))

func _clear_vfx_buffers() -> void:
	_ensure_all_vfx_profiles()
	edge_sweeps.clear()
	edge_ripples.clear()
	edge_afterimages.clear()
	completion_waves.clear()
	ui_light_bias = 0.0
	ui_light_target = 0.0
	solved_aura_level = 0.0

func _ready() -> void:
	set_process(true)
	_ensure_all_vfx_profiles()
	use_shader_background = _vfx_enabled(VFX_SHADER_BG)
	apply_quality_settings({})

func _ambient_animation_enabled() -> bool:
	if WEB_DISABLE_AMBIENT_ANIMATION and OS.has_feature("web"):
		return false
	return true

func _depth_blur_disabled() -> bool:
	return TEMP_DISABLE_BLUR or (WEB_DISABLE_DEPTH_BLUR and OS.has_feature("web"))

func _set_model(value: GridModel) -> void:
	model = value
	rotation_basis = Basis()
	dot_states.clear()
	edge_states.clear()
	_clear_vfx_buffers()
	hint_id = -1
	hint_ids.clear()
	_update_metrics()
	queue_redraw()

func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	if rotation_active:
		var now := float(Time.get_ticks_msec()) / 1000.0
		if now > rotation_deadline:
			_finish_rotation()
	var dirty := false
	_sync_edge_states()
	if _advance_vfx_timers(delta):
		dirty = true
	var animate_with_time := _has_non_ambient_time_driven_vfx()
	if _ambient_animation_enabled() and _should_step_ambient(delta):
		animate_with_time = true
	if animate_with_time:
		var motion_signed := _vfx_motion_factor()
		var motion_mix := clampf(absf(motion_signed) * 0.5, 0.0, 1.0)
		var direction := -1.0 if motion_signed < 0.0 else 1.0
		float_time += delta * float_speed * lerpf(0.25, 2.2, motion_mix) * direction
		dirty = true
	for key in dot_states.keys():
		var state: Dictionary = dot_states[key]
		if float(state.t) < 1.0:
			state.t = minf(1.0, float(state.t) + delta * dot_anim_speed)
			dot_states[key] = state
			dirty = true
	for key in edge_states.keys():
		var state: Dictionary = edge_states[key]
		var target: float = float(state.target)
		var t: float = float(state.t)
		if t != target:
			t = move_toward(t, target, delta * edge_anim_speed)
			state.t = t
			edge_states[key] = state
			dirty = true
		if t <= 0.0 and target <= 0.0:
			edge_states.erase(key)
	if dirty:
		queue_redraw()

func _has_non_ambient_time_driven_vfx() -> bool:
	return (_vfx_enabled(VFX_HINT_BEACON) and _has_hint_nodes()) \
		or (_vfx_enabled(VFX_UI_LIGHT_COUPLING) and (ui_light_bias > 0.001 or ui_light_target > 0.001)) \
		or not edge_sweeps.is_empty() \
		or not edge_ripples.is_empty() \
		or not edge_afterimages.is_empty() \
		or not completion_waves.is_empty()

func _has_hint_nodes() -> bool:
	return hint_id != -1 or not hint_ids.is_empty()

func _has_active_transitions() -> bool:
	if rotation_active:
		return true
	if not edge_sweeps.is_empty() or not edge_ripples.is_empty() or not edge_afterimages.is_empty() or not completion_waves.is_empty():
		return true
	if _has_hint_nodes():
		return true
	for key in dot_states.keys():
		var state: Dictionary = dot_states[key]
		if float(state.get("t", 1.0)) < 1.0:
			return true
	for key in edge_states.keys():
		var state: Dictionary = edge_states[key]
		if float(state.get("t", 0.0)) != float(state.get("target", 0.0)):
			return true
	return false

func _should_step_ambient(delta: float) -> bool:
	if _has_active_transitions():
		ambient_tick_accum = 0.0
		return true
	var target_fps := quality_ambient_fps
	if target_fps >= QUALITY_AMBIENT_FPS_DEFAULT - 1.0:
		ambient_tick_accum = 0.0
		return true
	ambient_tick_accum += delta
	var tick_interval := 1.0 / maxf(1.0, target_fps)
	if ambient_tick_accum < tick_interval:
		return false
	ambient_tick_accum = fmod(ambient_tick_accum, tick_interval)
	return true

func _advance_vfx_timers(delta: float) -> bool:
	var dirty := false
	if _advance_effect_list(edge_sweeps, delta):
		dirty = true
	if _advance_effect_list(edge_ripples, delta):
		dirty = true
	if _advance_effect_list(edge_afterimages, delta):
		dirty = true
	if _advance_effect_list(completion_waves, delta):
		dirty = true
	var prev_ui := ui_light_bias
	if _vfx_enabled(VFX_UI_LIGHT_COUPLING):
		var ui_motion := _vfx_speed_factor(VFX_UI_LIGHT_COUPLING)
		ui_light_bias = move_toward(ui_light_bias, ui_light_target, delta * 4.0 * ui_motion)
	else:
		ui_light_target = 0.0
		ui_light_bias = move_toward(ui_light_bias, 0.0, delta * 3.5)
	if absf(prev_ui - ui_light_bias) > 0.0005:
		dirty = true
	var prev_aura := solved_aura_level
	var aura_target := 0.0
	if _vfx_enabled(VFX_SOLVED_AURA) and model != null:
		var required := model.required_node_count()
		if required > 0:
			aura_target = float(model.connected_required_count()) / float(required)
	var aura_motion := _vfx_speed_factor(VFX_SOLVED_AURA)
	solved_aura_level = move_toward(solved_aura_level, clampf(aura_target, 0.0, 1.0), delta * 1.6 * aura_motion)
	if absf(prev_aura - solved_aura_level) > 0.0005:
		dirty = true
	return dirty

func _advance_effect_list(list: Array, delta: float) -> bool:
	var dirty := false
	for i in range(list.size() - 1, -1, -1):
		var fx: Dictionary = list[i]
		fx.age = float(fx.get("age", 0.0)) + delta
		var duration := maxf(0.001, float(fx.get("duration", 0.4)))
		if float(fx.age) >= duration:
			list.remove_at(i)
			dirty = true
		else:
			list[i] = fx
			dirty = true
	return dirty

func _is_touch_mobile_layout() -> bool:
	if not DisplayServer.is_touchscreen_available():
		return false
	return OS.has_feature("web") or OS.has_feature("mobile")

func _touch_short_side() -> float:
	var window_size := DisplayServer.window_get_size()
	var short_side := minf(float(window_size.x), float(window_size.y))
	var viewport_size := get_viewport_rect().size
	var viewport_short := minf(viewport_size.x, viewport_size.y)
	if viewport_short > 0.0:
		short_side = viewport_short if short_side <= 0.0 else minf(short_side, viewport_short)
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		var js_short := float(JavaScriptBridge.eval("Math.min(window.innerWidth || 0, window.innerHeight || 0)", true))
		if js_short > 0.0:
			short_side = js_short if short_side <= 0.0 else minf(short_side, js_short)
	return short_side

func _update_metrics() -> void:
	if model == null:
		return
	var vp := get_viewport_rect().size
	var pad_x := 100.0
	var pad_y := 180.0
	var min_cell := 68.0
	var max_cell := 170.0
	var size_boost := 0.95
	var radius_factor := 0.28
	if _is_touch_mobile_layout():
		var short_side := _touch_short_side()
		pad_x = 72.0
		pad_y = 128.0
		max_cell = 230.0
		size_boost = 1.12
		radius_factor = 0.31
		if short_side <= 430.0:
			pad_x = 56.0
			pad_y = 108.0
			max_cell = 250.0
			size_boost = 1.22
		elif short_side <= 520.0:
			pad_x = 64.0
			pad_y = 118.0
			max_cell = 240.0
			size_boost = 1.18
	var max_dim := maxi(maxi(model.nx, model.ny), model.nz)
	var span: int = maxi(max_dim - 1, 1)
	var max_cell_x: float = maxf(min_cell, (vp.x - pad_x) / float(span))
	var max_cell_y: float = maxf(min_cell, (vp.y - pad_y) / float(span))
	cell_size = clampf(minf(max_cell_x, max_cell_y), min_cell, max_cell)
	cell_size = clampf(cell_size * size_boost, min_cell, max_cell)
	base_radius = cell_size * radius_factor

func is_rotating() -> bool:
	return rotation_active

func apply_drag(delta: Vector2, sensitivity: float) -> void:
	if rotation_active:
		return
	if model == null:
		return
	var yaw_angle: float = -delta.x * sensitivity
	var pitch_angle: float = -delta.y * sensitivity
	if absf(yaw_angle) > 0.000001:
		rotation_basis = Basis(Vector3.UP, yaw_angle) * rotation_basis
	if absf(pitch_angle) > 0.000001:
		rotation_basis = Basis(Vector3.RIGHT, pitch_angle) * rotation_basis
	rotation_basis = rotation_basis.orthonormalized()
	queue_redraw()

func rotate_step(dir: Vector2) -> void:
	if rotation_active:
		return
	if model == null:
		return
	var target: Basis = rotation_basis
	if absf(dir.x) >= absf(dir.y):
		if dir.x != 0:
			var yaw_angle: float = -sign(dir.x) * PI / 2.0
			target = Basis(Vector3.UP, yaw_angle) * target
	else:
		if dir.y != 0:
			var pitch_angle: float = -sign(dir.y) * PI / 2.0
			target = Basis(Vector3.RIGHT, pitch_angle) * target
	_animate_to_basis(target.orthonormalized())

func snap_to_nearest() -> void:
	if rotation_active:
		return
	if model == null:
		return
	var target := _best_orientation_basis()
	_animate_to_basis(target)

func _animate_to_basis(target: Basis) -> void:
	rotation_active = true
	var now := float(Time.get_ticks_msec()) / 1000.0
	rotation_deadline = now + maxf(rotation_duration + 0.25, rotation_timeout_secs)
	_tween_from = rotation_basis.get_rotation_quaternion()
	_tween_to = target.get_rotation_quaternion()
	var tween := create_tween()
	tween.tween_method(_set_rotation_slerp, 0.0, 1.0, rotation_duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tween.finished.connect(_finish_rotation)

func _set_rotation_slerp(t: float) -> void:
	var q := _tween_from.slerp(_tween_to, t)
	rotation_basis = Basis(q).orthonormalized()
	queue_redraw()

func _finish_rotation() -> void:
	if not rotation_active:
		return
	rotation_active = false
	rotation_deadline = 0.0
	rotation_finished.emit()

func _draw() -> void:
	if model == null:
		return
	_update_metrics()
	var nodes := _compute_nodes()
	_sync_edge_states()
	var viewport_size := get_viewport_rect().size
	if not use_shader_background:
		_draw_theme_background(viewport_size)
	if _vfx_enabled(VFX_PARALLAX_FOG):
		_draw_parallax_fog(viewport_size)
	if _vfx_enabled(VFX_AMBIENT_PARTICLES):
		_draw_ambient_particles(viewport_size)
	if _vfx_enabled(VFX_HEAT_SHIMMER) and current_theme_id == THEME_WARM:
		_draw_heat_shimmer(viewport_size)
	if _vfx_enabled(VFX_UI_LIGHT_COUPLING):
		_draw_ui_light_glaze(viewport_size)
	var positions := {}
	var items: Array = []
	for n in nodes:
		positions[n.id] = n
		items.append({"kind": "node", "depth": n.depth, "node": n})
	_draw_solved_aura(positions, viewport_size)
	for key in edge_states.keys():
		var state: Dictionary = edge_states[key]
		var t: float = float(state.t)
		if t <= 0.0:
			continue
		var pair := model.decode_edge(key)
		var a := pair.x
		var b := pair.y
		if not positions.has(a) or not positions.has(b):
			continue
		var fa: float = positions[a].fade
		var fb: float = positions[b].fade
		var fade := minf(fa, fb)
		var depth: float = (float(positions[a].depth) + float(positions[b].depth)) * 0.5 - 0.0001
		items.append({
			"kind": "edge",
			"depth": depth,
			"key": key,
			"a": a,
			"b": b,
			"fade": fade,
			"t": t
		})
	items.sort_custom(func(a, b): return a.depth < b.depth)
	for item in items:
		if item.kind == "edge":
			_draw_edge_item(item, positions)
		else:
			_draw_node_item(item.node)
	_draw_edge_afterimages(positions)
	_draw_edge_ripples(positions)
	_draw_completion_waves(positions, viewport_size)

func _draw_neon_background(size: Vector2) -> void:
	_draw_warm_background(size)

func _draw_theme_background(size: Vector2) -> void:
	match current_theme_id:
		THEME_TERMINAL:
			_draw_terminal_background(size)
		THEME_WARM:
			_draw_warm_background(size)
		_:
			_draw_classic_background(size)

func _draw_classic_background(size: Vector2) -> void:
	draw_rect(Rect2(Vector2.ZERO, size), color_bg)
	var top_light := Color("#FFFFFF")
	top_light.a = 0.045
	_draw_soft_radial(Vector2(size.x * 0.5, size.y * 0.15), minf(size.x, size.y) * 0.82, top_light, 10)
	var side_light := Color("#DAD2C4")
	side_light.a = 0.032
	_draw_soft_radial(Vector2(size.x * 0.08, size.y * 0.55), minf(size.x, size.y) * 0.48, side_light, 8)
	var band := Color("#E8E4DC")
	band.a = 0.36
	draw_rect(Rect2(0.0, size.y * 0.64, size.x, size.y * 0.2), band)
	for i in range(72):
		var fi := float(i)
		var x := _hash01(fi * 11.39 + 0.7)
		var y := _hash01(fi * 37.21 + 2.3)
		var dust := Color("#A29A8D")
		dust.a = lerpf(0.015, 0.055, _hash01(fi * 2.13 + 0.31))
		draw_circle(Vector2(size.x * x, size.y * y), lerpf(0.5, 1.4, _hash01(fi * 0.91 + 0.6)), dust)
	var vignette := Color("#9D9384")
	vignette.a = 0.038
	_draw_vignette(size, vignette, 11, 1.6)

func _draw_warm_background(size: Vector2) -> void:
	draw_rect(Rect2(Vector2.ZERO, size), color_bg)
	var glow_center := Vector2(size.x * 0.5, size.y * 0.42)
	var glow_base := Color("#A6632B")
	for i in range(12, 0, -1):
		var t := float(i) / 12.0
		var c := glow_base
		c.a = 0.012 * t
		draw_circle(glow_center, min(size.x, size.y) * 0.13 * float(13 - i), c)
	var horizon_glow := Color("#FFB971")
	horizon_glow.a = 0.03
	_draw_soft_radial(Vector2(size.x * 0.5, size.y * 0.8), minf(size.x, size.y) * 0.58, horizon_glow, 10)
	var ember := Color("#FFBE72")
	ember.a = 0.024
	_draw_wisp_trail(size, 2.1, ember, minf(size.x, size.y) * 0.11, 0.12)
	_draw_wisp_trail(size, 7.4, ember, minf(size.x, size.y) * 0.09, -0.1)
	for i in range(90):
		var fi := float(i)
		var x := _hash01(fi * 27.13 + 1.7)
		var y := _hash01(fi * 45.71 + 3.1)
		var twinkle := 0.5 + 0.5 * sin(float_time * 1.9 + fi * 0.37)
		var alpha := lerpf(0.03, 0.16, _hash01(fi * 0.93 + 0.4)) * twinkle
		var r := lerpf(0.8, 2.0, _hash01(fi * 1.77 + 0.9))
		var star := Color("#F6BE79")
		star.a = alpha
		draw_circle(Vector2(size.x * x, size.y * y), r, star)
	var warm_vignette := Color("#3B2516")
	warm_vignette.a = 0.055
	_draw_vignette(size, warm_vignette, 11, 1.7)

func _draw_terminal_background(size: Vector2) -> void:
	draw_rect(Rect2(Vector2.ZERO, size), color_bg)
	var core_glow := Color("#62F089")
	core_glow.a = 0.022
	_draw_soft_radial(Vector2(size.x * 0.5, size.y * 0.45), minf(size.x, size.y) * 0.66, core_glow, 10)
	var crt_glow := Color("#65FF90")
	for i in range(11, 0, -1):
		var t := float(i) / 11.0
		var band := crt_glow
		band.a = 0.006 * t
		draw_rect(Rect2(0.0, size.y * 0.18 * t, size.x, size.y * 0.025), band)
	for y in range(0, int(size.y), 4):
		var scan := Color("#0A2A12")
		scan.a = 0.18
		draw_line(Vector2(0.0, float(y)), Vector2(size.x, float(y)), scan, 1.0)
	for y in range(0, int(size.y), 22):
		var row := Color("#123C1E")
		row.a = 0.08
		draw_line(Vector2(0.0, float(y)), Vector2(size.x, float(y)), row, 1.0)
	var grid_top := size.y * 0.56
	var grid := Color("#1E5E33")
	grid.a = 0.11
	for x_step in range(0, 13):
		var tx := float(x_step) / 12.0
		var x := size.x * tx
		draw_line(Vector2(x, grid_top), Vector2(x, size.y), grid, 1.0)
	var stream := Color("#7DF89A")
	stream.a = 0.018
	_draw_wisp_trail(size, 4.3, stream, minf(size.x, size.y) * 0.07, 0.09)
	for i in range(120):
		var fi := float(i)
		var x := _hash01(fi * 21.13 + 1.7)
		var y := _hash01(fi * 42.71 + 3.1)
		var twinkle := 0.5 + 0.5 * sin(float_time * 1.7 + fi * 0.33)
		var alpha := lerpf(0.02, 0.11, _hash01(fi * 0.83 + 0.4)) * twinkle
		var star := Color("#77E88E")
		star.a = alpha
		draw_circle(Vector2(size.x * x, size.y * y), 1.0, star)
	var terminal_vignette := Color("#001505")
	terminal_vignette.a = 0.06
	_draw_vignette(size, terminal_vignette, 12, 1.6)

func _draw_parallax_fog(size: Vector2) -> void:
	var intensity := _vfx_intensity_factor(VFX_PARALLAX_FOG)
	var motion_signed := _vfx_motion_factor(VFX_PARALLAX_FOG)
	var motion := absf(motion_signed)
	var motion_mix := clampf(motion * 0.5, 0.0, 1.0)
	var direction := -1.0 if motion_signed < 0.0 else 1.0
	var fog_base := Color("#7A9CC3")
	match current_theme_id:
		THEME_WARM:
			fog_base = Color("#FFAD73")
		THEME_TERMINAL:
			fog_base = Color("#68E091")
		_:
			fog_base = Color("#A8B6C8")
	for i in range(4):
		var fi := float(i)
		var x := size.x * (0.16 + fi * 0.21 + sin(float_time * direction * (0.18 + motion * 0.12) + fi * 1.47) * lerpf(0.01, 0.06, motion_mix))
		var y := size.y * (0.18 + fi * 0.16 + cos(float_time * direction * (0.14 + motion * 0.11) + fi * 1.83) * lerpf(0.015, 0.075, motion_mix))
		var color := fog_base
		color.a = (0.008 + 0.022 * (0.5 + 0.5 * sin(float_time * (0.46 + motion * 0.28) + fi))) * intensity
		var radius := minf(size.x, size.y) * (0.24 + fi * 0.09)
		draw_circle(Vector2(x, y), radius, color)

func _draw_ambient_particles(size: Vector2) -> void:
	var intensity := _vfx_intensity_factor(VFX_AMBIENT_PARTICLES)
	var motion_signed := _vfx_motion_factor(VFX_AMBIENT_PARTICLES)
	var motion := absf(motion_signed)
	var direction := -1.0 if motion_signed < 0.0 else 1.0
	var particle_color := Color("#9FB7CE")
	match current_theme_id:
		THEME_WARM:
			particle_color = Color("#FFC388")
		THEME_TERMINAL:
			particle_color = Color("#84F6A0")
		_:
			particle_color = Color("#A9B7C8")
	var normalized := clampf(intensity / VFX_INTENSITY_MAX, 0.0, 1.0)
	var raw_count := int(round(lerpf(10.0, 36.0, normalized)))
	var count := clampi(raw_count, 8, quality_particle_cap)
	for i in range(count):
		var fi := float(i)
		var speed := 0.08 + _hash01(fi * 4.13 + 1.7) * 0.4
		var phase := _hash01(fi * 15.37 + 0.2) * TAU
		var drift := float_time * speed * direction * (0.3 + motion * 0.95)
		var x := fposmod(_hash01(fi * 19.91 + 0.4) + drift * 0.03, 1.04) - 0.02
		var y := fposmod(_hash01(fi * 23.77 + 1.3) + sin(float_time * (0.2 + motion * 0.35) + phase) * 0.02, 1.02)
		var pulse := 0.45 + 0.55 * sin(float_time * (1.2 + motion * 0.9) + phase * 1.3)
		var alpha := (0.012 + 0.055 * pulse) * intensity
		var radius := lerpf(0.8, 2.4, _hash01(fi * 6.1 + 0.7))
		var c := particle_color
		c.a = alpha
		var pos := Vector2(size.x * x, size.y * y)
		draw_circle(pos, radius, c)
		if pulse > 0.7:
			var tail := c
			tail.a *= 0.22
			draw_circle(pos + Vector2(radius * 2.2, 0.0), radius * 1.1, tail)

func _draw_heat_shimmer(size: Vector2) -> void:
	var intensity := _vfx_intensity_factor(VFX_HEAT_SHIMMER)
	var motion_signed := _vfx_motion_factor(VFX_HEAT_SHIMMER)
	var motion := absf(motion_signed)
	var motion_mix := clampf(motion * 0.5, 0.0, 1.0)
	var direction := -1.0 if motion_signed < 0.0 else 1.0
	for i in range(6):
		var fi := float(i)
		var y := size.y * (0.28 + fi * 0.09 + sin(float_time * direction * (0.46 + motion * 0.82) + fi * 1.33) * lerpf(0.006, 0.02, motion_mix))
		var alpha := (0.014 + 0.03 * (0.5 + 0.5 * sin(float_time * (0.82 + motion * 0.65) + fi * 0.7))) * intensity
		var c := Color("#FFC98D")
		c.a = alpha
		draw_line(Vector2(0.0, y), Vector2(size.x, y), c, 1.0)

func _draw_ui_light_glaze(size: Vector2) -> void:
	if ui_light_bias <= 0.001:
		return
	var intensity := _vfx_intensity_factor(VFX_UI_LIGHT_COUPLING)
	var beam := _tint_color(color_selected, 1.0)
	beam.a = (0.012 + ui_light_bias * 0.09) * intensity
	_draw_soft_radial(
		Vector2(size.x * 0.5, size.y * 0.04),
		minf(size.x, size.y) * (0.2 + ui_light_bias * 0.32),
		beam,
		10
	)

func _draw_soft_radial(center: Vector2, radius: float, color: Color, layers: int) -> void:
	if radius <= 0.1 or color.a <= 0.001:
		return
	var count := maxi(1, layers)
	for i in range(count, 0, -1):
		var t := float(i) / float(count)
		var c := color
		c.a *= t * t
		draw_circle(center, radius * t, c)

func _draw_vignette(size: Vector2, color: Color, rings: int, width: float) -> void:
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

func _draw_wisp_trail(size: Vector2, seed: float, color: Color, thickness: float, arc_scale: float) -> void:
	if color.a <= 0.001:
		return
	var start := Vector2(
		size.x * lerpf(0.02, 0.28, _hash01(seed * 2.17 + 0.31)),
		size.y * lerpf(0.18, 0.82, _hash01(seed * 1.13 + 0.91))
	)
	var end := Vector2(
		size.x * lerpf(0.66, 0.98, _hash01(seed * 3.47 + 0.63)),
		size.y * lerpf(0.14, 0.86, _hash01(seed * 5.73 + 0.27))
	)
	var arc := size.y * arc_scale
	var steps := 18
	for i in range(steps):
		var t := float(i) / float(steps - 1)
		var p := start.lerp(end, t)
		var sway := sin(float_time * 0.4 + seed * 1.9 + t * TAU) * size.x * 0.012
		p.x += sway
		p.y += sin(t * PI) * arc
		var focus := sin(t * PI)
		var c := color
		c.a *= focus * focus
		var radius := thickness * lerpf(0.35, 1.0, focus)
		draw_circle(p, radius, c)

func _hash01(seed: float) -> float:
	return fposmod(sin(seed) * 43758.5453, 1.0)

func _sync_edge_states() -> void:
	if model == null:
		edge_states.clear()
		return
	var present := {}
	for key in model.placed_edges.keys():
		present[key] = true
		if not edge_states.has(key):
			edge_states[key] = {"t": 0.0, "target": 1.0}
		else:
			var state: Dictionary = edge_states[key]
			state.target = 1.0
			edge_states[key] = state
	for key in edge_states.keys():
		if not present.has(key):
			var state: Dictionary = edge_states[key]
			state.target = 0.0
			edge_states[key] = state

func pick_node(global_pos: Vector2) -> int:
	if model == null:
		return -1
	if rotation_active:
		return -1
	var nodes := _compute_nodes()
	var best_id := -1
	var best_score := 1e9
	for n in nodes:
		if n.fade < PICK_FADE_MIN:
			continue
		var is_front_face := _is_node_on_front_face(int(n.id))
		var blur := clampf(float(n.get("blur", 1.0)), 0.0, 1.0)
		if not is_front_face and blur > PICK_BLUR_MAX:
			continue
		var pos: Vector2 = n.pos
		var radius: float = n.radius
		var d := pos.distance_to(global_pos)
		var pick_radius := radius * lerpf(1.2, 1.35, blur)
		if d <= pick_radius:
			var score := d / maxf(1.0, radius)
			if is_front_face:
				score += blur * 0.15
			else:
				score += 0.55 + blur * 0.7
			if score < best_score:
				best_score = score
				best_id = n.id
	return best_id

func _compute_nodes() -> Array:
	var out: Array = []
	var center := get_viewport_rect().size * 0.5
	var cam_dist := _camera_distance()
	for node_id in range(model.total_nodes()):
		if not model.is_active(node_id):
			continue
		var c := model.coords(node_id)
		var p := _node_position(c) + _float_offset(node_id)
		var r := _rotate_vec(p)
		var depth := cam_dist - r.z
		if depth <= 0.1:
			continue
		var scale := cam_dist / depth
		var screen := center + Vector2(r.x, -r.y) * scale
		var radius := base_radius * scale
		var fade := _fade_from_depth(r.z)
		var face_z := _node_face_z(c)
		var face_fade := clampf(face_z, 0.0, 1.0)
		fade = maxf(fade, face_fade)
		var blur := clampf(pow(1.0 - face_fade, 1.15), 0.0, 1.0)
		out.append({"id": node_id, "pos": screen, "depth": r.z, "radius": radius, "fade": fade, "blur": blur})
	out.sort_custom(func(a, b): return a.depth < b.depth)
	return out

func _draw_edge_item(item: Dictionary, positions: Dictionary) -> void:
	var a: int = item.a
	var b: int = item.b
	var edge_key: int = int(item.get("key", -1))
	var t: float = clampf(float(item.t), 0.0, 1.0)
	var color := _edge_color(float(item.fade))
	color.a *= t
	var start: Vector2 = positions[a].pos
	var end: Vector2 = positions[b].pos
	var dir := end - start
	var len := dir.length()
	if len < 0.001:
		return
	var unit := dir / len
	var ra: float = positions[a].radius
	var rb: float = positions[b].radius
	var inset_a := minf(ra * 0.9, len * 0.45)
	var inset_b := minf(rb * 0.9, len * 0.45)
	start += unit * inset_a
	end -= unit * inset_b
	var fx_start := start
	var fx_end := end
	var mid := (start + end) * 0.5
	var half := (end - start) * 0.5 * t
	start = mid - half
	end = mid + half
	if current_theme_id == THEME_TERMINAL:
		var glow_outer := color
		glow_outer.a *= 0.26
		var hot := color.lerp(Color("#E8FFEE"), 0.42)
		hot.a *= 0.8
		_draw_dashed_line(start, end, glow_outer, maxf(4.8, base_radius * 0.42), maxf(8.0, base_radius * 0.4), maxf(4.2, base_radius * 0.2))
		_draw_dashed_line(start, end, hot, maxf(1.9, base_radius * 0.15), maxf(5.0, base_radius * 0.24), maxf(3.0, base_radius * 0.14))
	elif current_theme_id == THEME_WARM:
		var glow_outer := color
		glow_outer.a *= 0.24
		var hot := color.lerp(Color("#FFF2D2"), 0.45)
		hot.a *= 0.82
		draw_line(start, end, glow_outer, maxf(5.2, base_radius * 0.46))
		draw_line(start, end, hot, maxf(2.0, base_radius * 0.16))
	else:
		draw_line(start, end, color, maxf(1.8, base_radius * 0.15))
	_draw_edge_sweep(edge_key, a, b, fx_start, fx_end, color)

func _draw_edge_sweep(edge_key: int, edge_a: int, edge_b: int, start: Vector2, end: Vector2, color: Color) -> void:
	if edge_key == -1 or not _vfx_enabled(VFX_EDGE_SWEEP):
		return
	var intensity := _vfx_intensity_factor(VFX_EDGE_SWEEP)
	for fx in edge_sweeps:
		if int(fx.get("key", -1)) != edge_key:
			continue
		var duration := maxf(0.001, float(fx.get("duration", 0.58)))
		var t := clampf(float(fx.get("age", 0.0)) / duration, 0.0, 1.0)
		# Keep sweep direction from action order (selected/source -> target).
		var dir_forward := int(fx.get("a", edge_a)) == edge_a and int(fx.get("b", edge_b)) == edge_b
		var travel_t := t if dir_forward else 1.0 - t
		var sweep_head := start.lerp(end, travel_t)
		var tail_t := clampf(travel_t - 0.24, 0.0, 1.0) if dir_forward else clampf(travel_t + 0.24, 0.0, 1.0)
		var sweep_tail := start.lerp(end, tail_t)
		var power := 1.0 - absf(t - 0.5) * 1.8
		if power <= 0.0:
			continue
		var beam := color.lerp(Color.WHITE, 0.62)
		beam.a = (0.1 + power * 0.32) * (1.0 + ui_light_bias * 0.45) * intensity
		var inner := Color.WHITE
		inner.a = beam.a * 0.75
		var outer_width := maxf(3.2, base_radius * 0.3) * lerpf(0.82, 1.55, intensity * 0.5)
		var inner_width := maxf(1.5, base_radius * 0.15) * lerpf(0.86, 1.3, intensity * 0.5)
		draw_line(sweep_tail, sweep_head, beam, outer_width)
		draw_line(sweep_tail, sweep_head, inner, inner_width)

func _draw_dashed_line(start: Vector2, end: Vector2, color: Color, width: float, dash_len: float, gap_len: float) -> void:
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

func _draw_node_item(n: Dictionary) -> void:
	if current_theme_id == THEME_TERMINAL:
		_draw_terminal_node_item(n)
	else:
		_draw_round_node_item(n, current_theme_id == THEME_WARM)

func _draw_round_node_item(n: Dictionary, warm_mode: bool) -> void:
	var node_id: int = n.id
	var pos: Vector2 = n.pos
	var radius: float = n.radius
	var fade: float = n.fade
	var blur_strength: float = 0.0 if _depth_blur_disabled() else clampf(float(n.get("blur", 0.0)), 0.0, 1.0)
	var remaining := model.remaining_dots(node_id)
	var unsolved_white := force_unsolved_white_fill and remaining > 0
	if blur_strength > 0.02:
		_draw_depth_blur(pos, radius, fade, blur_strength)
	var frame_color := _tint_color(color_circle, fade)
	var fill_mix := 0.72 + blur_strength * 0.12
	if warm_mode:
		fill_mix = 0.56 + blur_strength * 0.08
	var fill_color := frame_color.lerp(color_bg, fill_mix)
	var quiet_color := _tint_color(color_quiet, fade)
	var dot_color := _tint_color(color_dot, fade)
	var glow_color := _tint_color(color_edge, maxf(fade, 0.55))
	if unsolved_white:
		fill_color = Color(1, 1, 1, 1)
	elif warm_mode:
		fill_color = fill_color.lerp(Color("#FFC67A"), 0.16)
		fill_color.a = 1.0
	if warm_mode:
		_draw_full_node_glow(pos, radius, glow_color, blur_strength)
	quiet_color = quiet_color.lerp(color_bg, blur_strength * 0.28)
	frame_color = frame_color.lerp(color_bg, blur_strength * 0.35)
	dot_color = dot_color.lerp(color_bg, blur_strength * 0.22)
	draw_circle(pos, maxf(2.0, radius - maxf(0.5, radius * 0.08)), fill_color)
	if remaining == 0:
		draw_circle(pos, maxf(2.0, radius - 1.2), quiet_color)
	elif warm_mode and not unsolved_white:
		var core := fill_color.lerp(Color("#FFF0C6"), 0.28)
		core.a *= lerpf(0.65, 0.84, fade)
		draw_circle(pos, maxf(2.0, radius * 0.8), core)
		var hot := Color("#FFF9E8")
		hot.a = lerpf(0.07, 0.18, fade) * lerpf(1.0, 0.65, blur_strength)
		draw_circle(pos, maxf(2.0, radius * 0.5), hot)
	var ring_alpha := lerpf(1.0, 0.55 if warm_mode else 0.42, blur_strength)
	var ring_width := maxf(1.6, radius * lerpf(0.12 if warm_mode else 0.11, 0.2 if warm_mode else 0.18, blur_strength))
	frame_color.a *= ring_alpha
	draw_arc(pos, radius, 0.0, TAU, quality_ring_arc_points, frame_color, ring_width)
	if node_id == selected_id:
		var sel_color := _tint_color(color_selected, maxf(fade, 0.6))
		draw_arc(pos, radius + 4.0, 0.0, TAU, quality_ring_arc_points, sel_color, maxf(1.6, radius * 0.12))
	if _is_hint_node(node_id):
		var hint_color := _tint_color(color_selected, maxf(fade, 0.55))
		if _vfx_enabled(VFX_HINT_BEACON):
			var hint_intensity := _vfx_intensity_factor(VFX_HINT_BEACON)
			var hint_motion := _vfx_speed_factor(VFX_HINT_BEACON)
			var pulse := 0.5 + 0.5 * sin(float_time * (5.2 + hint_motion * 1.1) + float(node_id) * 0.73)
			var ring_radius := radius + 6.0 + pulse * 7.0
			var hint_width := maxf(1.5, radius * (0.08 + pulse * 0.05))
			hint_color.a *= (0.6 + pulse * 0.4) * hint_intensity
			draw_arc(pos, ring_radius, 0.0, TAU, quality_hint_arc_points, hint_color, hint_width)
			var outer := hint_color
			outer.a *= 0.35
			draw_arc(pos, ring_radius + 5.0, 0.0, TAU, quality_hint_arc_points, outer, maxf(1.2, hint_width * 0.65))
		else:
			draw_arc(pos, radius + 8.0, 0.0, TAU, quality_ring_arc_points, hint_color, maxf(1.4, radius * 0.1))
	dot_color.a *= lerpf(0.95, 0.24, blur_strength)
	if dot_color.a > 0.02:
		_draw_dots(node_id, pos, remaining, radius, dot_color)

func _draw_terminal_node_item(n: Dictionary) -> void:
	var node_id: int = n.id
	var pos: Vector2 = n.pos
	var radius: float = n.radius
	var fade: float = n.fade
	var blur_strength: float = 0.0 if _depth_blur_disabled() else clampf(float(n.get("blur", 0.0)), 0.0, 1.0)
	var remaining := model.remaining_dots(node_id)
	var unsolved_white := force_unsolved_white_fill and remaining > 0
	var frame_color := _tint_color(color_circle, fade)
	var fill_color := frame_color.lerp(color_bg, 0.58 + blur_strength * 0.08)
	var dot_color := _tint_color(color_dot, fade)
	if unsolved_white:
		fill_color = Color(1, 1, 1, 1)
	else:
		fill_color = fill_color.lerp(Color("#74E48A"), 0.12)
		fill_color.a = 1.0
	frame_color = frame_color.lerp(color_bg, blur_strength * 0.35)
	dot_color = dot_color.lerp(color_bg, blur_strength * 0.16)
	var half := maxf(6.0, radius * 0.9)
	var rect := Rect2(pos - Vector2(half, half), Vector2(half * 2.0, half * 2.0))
	draw_rect(rect, fill_color, true)
	if not unsolved_white:
		var hot_rect := rect.grow(-maxf(2.0, radius * 0.26))
		if hot_rect.size.x > 0.0 and hot_rect.size.y > 0.0:
			var hot := fill_color.lerp(Color("#D5FFDF"), 0.42)
			hot.a *= lerpf(0.48, 0.3, blur_strength)
			draw_rect(hot_rect, hot, true)
	draw_rect(rect, frame_color, false, maxf(1.4, radius * 0.09))
	if node_id == selected_id:
		var sel_color := _tint_color(color_selected, maxf(fade, 0.6))
		draw_rect(rect.grow(4.0), sel_color, false, maxf(1.6, radius * 0.12))
	if _is_hint_node(node_id):
		var hint_color := _tint_color(color_selected, maxf(fade, 0.55))
		if _vfx_enabled(VFX_HINT_BEACON):
			var hint_intensity := _vfx_intensity_factor(VFX_HINT_BEACON)
			var hint_motion := _vfx_speed_factor(VFX_HINT_BEACON)
			var pulse := 0.5 + 0.5 * sin(float_time * (5.5 + hint_motion * 1.2) + float(node_id) * 0.81)
			hint_color.a *= (0.55 + pulse * 0.45) * hint_intensity
			var growth := 7.0 + pulse * 6.0
			draw_rect(rect.grow(growth), hint_color, false, maxf(1.2, radius * (0.07 + pulse * 0.05)))
		else:
			draw_rect(rect.grow(8.0), hint_color, false, maxf(1.4, radius * 0.1))
	if remaining > 0:
		dot_color.a *= lerpf(0.95, 0.32, blur_strength)
		if dot_color.a > 0.02:
			_draw_terminal_cube_markers(pos, remaining, radius, dot_color)

func _draw_terminal_cube_markers(pos: Vector2, count: int, radius: float, color: Color) -> void:
	var marker_count := clampi(count, 1, 4)
	var spacing := radius * 0.35
	var offsets := _dot_offsets(marker_count, spacing)
	var half := maxf(1.8, radius * 0.14)
	for offset in offsets:
		var center := pos + Vector2(offset)
		var cube_rect := Rect2(center - Vector2.ONE * half, Vector2.ONE * half * 2.0)
		draw_rect(cube_rect, color, true)
		var rim := color.lerp(Color.WHITE, 0.22)
		rim.a *= 0.88
		draw_rect(cube_rect, rim, false, maxf(1.0, half * 0.22))

func _draw_full_node_glow(pos: Vector2, radius: float, color: Color, blur_strength: float) -> void:
	var tex := _ensure_glow_texture()
	if tex == null:
		return
	var pass_count := clampi(quality_warm_glow_passes, 1, 4)
	var intensity := _vfx_intensity_factor()
	var pulse := 0.94 + 0.06 * sin(float_time * 3.1 + pos.x * 0.012 + pos.y * 0.01)
	var ui_boost := 1.0 + (ui_light_bias * 0.8 if _vfx_enabled(VFX_UI_LIGHT_COUPLING) else 0.0)
	var aura := color.lerp(Color.WHITE, 0.1)
	aura.a = lerpf(0.04, 0.12, 1.0 - blur_strength) * pulse * ui_boost * intensity
	_draw_glow_sprite(tex, pos, radius * lerpf(1.9, 1.55, blur_strength), aura)
	if pass_count >= 2:
		var bloom := color.lerp(Color.WHITE, 0.22)
		bloom.a = lerpf(0.03, 0.09, 1.0 - blur_strength) * pulse * ui_boost * intensity
		_draw_glow_sprite(tex, pos, radius * lerpf(1.32, 1.12, blur_strength), bloom)
	if pass_count >= 3:
		var hot_core := color.lerp(Color.WHITE, 0.66)
		hot_core.a = lerpf(0.08, 0.2, 1.0 - blur_strength) * pulse * ui_boost * intensity
		_draw_glow_sprite(tex, pos, radius * 0.86, hot_core)
	if pass_count >= 4:
		var spark := Color.WHITE
		spark.a = lerpf(0.01, 0.045, 1.0 - blur_strength) * pulse * ui_boost * intensity
		_draw_glow_sprite(tex, pos, radius * 0.42, spark)

func _draw_glow_sprite(tex: Texture2D, pos: Vector2, radius: float, modulate: Color) -> void:
	if tex == null:
		return
	if radius <= 0.1 or modulate.a <= 0.001:
		return
	var size := Vector2.ONE * radius * 2.0
	draw_texture_rect(tex, Rect2(pos - size * 0.5, size), false, modulate)

func _ensure_glow_texture() -> Texture2D:
	if glow_texture != null:
		return glow_texture
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
	glow_texture = ImageTexture.create_from_image(image)
	return glow_texture

func _is_hint_node(node_id: int) -> bool:
	if node_id == hint_id:
		return true
	return hint_ids.has(node_id)

func _draw_edge_afterimages(positions: Dictionary) -> void:
	if edge_afterimages.is_empty():
		return
	for fx in edge_afterimages:
		var a := int(fx.get("a", -1))
		var b := int(fx.get("b", -1))
		if not positions.has(a) or not positions.has(b):
			continue
		var points := _edge_points(a, b, positions)
		if points.is_empty():
			continue
		var t := clampf(float(fx.get("age", 0.0)) / maxf(0.001, float(fx.get("duration", 0.6))), 0.0, 1.0)
		var kind := String(fx.get("kind", "trail"))
		if kind == "dissolve":
			if _vfx_enabled(VFX_DISCONNECT_DISSOLVE):
				_draw_dissolve_pass(points.start, points.end, t)
		elif _vfx_enabled(VFX_PHOSPHOR_TRAIL):
			_draw_phosphor_pass(points.start, points.end, t)

func _draw_phosphor_pass(start: Vector2, end: Vector2, t: float) -> void:
	var intensity := _vfx_intensity_factor(VFX_PHOSPHOR_TRAIL)
	var hold := pow(1.0 - t, 1.7)
	var color := _tint_color(color_edge, 0.95).lerp(Color.WHITE, 0.32)
	color.a = (0.06 + 0.22 * hold) * (1.0 + ui_light_bias * 0.35) * intensity
	var width := maxf(2.2, base_radius * 0.2) * lerpf(0.8, 1.45, intensity * 0.5)
	if current_theme_id == THEME_TERMINAL:
		_draw_dashed_line(start, end, color, width, maxf(6.0, base_radius * 0.33), maxf(3.0, base_radius * 0.16))
	else:
		draw_line(start, end, color, width)

func _draw_dissolve_pass(start: Vector2, end: Vector2, t: float) -> void:
	var intensity := _vfx_intensity_factor(VFX_DISCONNECT_DISSOLVE)
	var fade := pow(1.0 - t, 1.5)
	if fade <= 0.01:
		return
	var line_color := _tint_color(color_edge, 0.85)
	line_color.a = 0.18 * fade * intensity
	draw_line(start, end, line_color, maxf(1.5, base_radius * 0.14))
	var axis := end - start
	var length := axis.length()
	if length <= 0.001:
		return
	var tangent := axis / length
	var normal := Vector2(-tangent.y, tangent.x)
	for i in range(8):
		var fi := float(i)
		var u := (fi + 0.5) / 8.0
		var p := start.lerp(end, u)
		var drift := (0.5 - _hash01(fi * 13.11 + t * 57.0 + start.x * 0.01)) * length * 0.08
		p += normal * drift * t
		var particle := _tint_color(color_edge, 0.95)
		particle.a = 0.1 * fade * intensity
		var particle_radius := maxf(1.0, base_radius * 0.045 * (1.0 + t * 1.6)) * lerpf(0.8, 1.4, intensity * 0.5)
		if current_theme_id == THEME_TERMINAL:
			var half := particle_radius
			var rect := Rect2(p - Vector2.ONE * half, Vector2.ONE * half * 2.0)
			draw_rect(rect, particle, true)
		else:
			draw_circle(p, particle_radius, particle)

func _draw_edge_ripples(positions: Dictionary) -> void:
	if not _vfx_enabled(VFX_CONNECT_RIPPLE):
		return
	var intensity := _vfx_intensity_factor(VFX_CONNECT_RIPPLE)
	for fx in edge_ripples:
		var t := clampf(float(fx.get("age", 0.0)) / maxf(0.001, float(fx.get("duration", 0.4))), 0.0, 1.0)
		var alpha := pow(1.0 - t, 1.8) * 0.28 * intensity
		var ripple := _tint_color(color_selected, 0.95)
		ripple.a = alpha
		var connected := bool(fx.get("connected", true))
		for id_key in ["a", "b"]:
			var node_id := int(fx.get(id_key, -1))
			if not positions.has(node_id):
				continue
			var node: Dictionary = positions[node_id]
			var radius := float(node.radius) * (1.1 + t * 2.4)
			var width := maxf(1.2, float(node.radius) * (0.08 + 0.03 * (1.0 - t)))
			if current_theme_id == THEME_TERMINAL:
				var scale := 1.0 if connected else 1.08
				var ripple_strength := 1.0 if connected else 0.82
				ripple.a *= ripple_strength
				radius *= scale
				var rect := Rect2(node.pos - Vector2(radius, radius), Vector2(radius * 2.0, radius * 2.0))
				draw_rect(rect, ripple, false, width)
			else:
				draw_arc(node.pos, radius, 0.0, TAU, quality_hint_arc_points, ripple, width)

func _draw_completion_waves(positions: Dictionary, viewport_size: Vector2) -> void:
	if completion_waves.is_empty() or not _vfx_enabled(VFX_COMPLETION_SHOCKWAVE):
		return
	var intensity := _vfx_intensity_factor(VFX_COMPLETION_SHOCKWAVE)
	var center := _board_center(positions, viewport_size)
	for fx in completion_waves:
		var t := clampf(float(fx.get("age", 0.0)) / maxf(0.001, float(fx.get("duration", 0.9))), 0.0, 1.0)
		var alpha := pow(1.0 - t, 1.9) * 0.3 * intensity
		var radius := minf(viewport_size.x, viewport_size.y) * (0.18 + t * 0.72)
		var ring := _tint_color(color_selected, 1.0)
		ring.a = alpha
		draw_arc(center, radius, 0.0, TAU, quality_completion_arc_points, ring, maxf(2.0, base_radius * 0.14))
		var halo := ring
		halo.a *= 0.25
		draw_circle(center, radius * 0.92, halo)

func _draw_solved_aura(positions: Dictionary, viewport_size: Vector2) -> void:
	if solved_aura_level <= 0.001 or not _vfx_enabled(VFX_SOLVED_AURA):
		return
	var intensity := _vfx_intensity_factor(VFX_SOLVED_AURA)
	var center := _board_center(positions, viewport_size)
	var aura := _tint_color(color_selected, 1.0)
	aura.a = (0.01 + 0.08 * solved_aura_level * solved_aura_level) * intensity
	var radius := minf(viewport_size.x, viewport_size.y) * (0.2 + solved_aura_level * 0.35)
	_draw_soft_radial(center, radius, aura, 8)

func _board_center(positions: Dictionary, viewport_size: Vector2) -> Vector2:
	if positions.is_empty():
		return viewport_size * 0.5
	var sum := Vector2.ZERO
	for node in positions.values():
		sum += node.pos
	return sum / float(positions.size())

func _edge_points(a: int, b: int, positions: Dictionary) -> Dictionary:
	if not positions.has(a) or not positions.has(b):
		return {}
	var start: Vector2 = positions[a].pos
	var end: Vector2 = positions[b].pos
	var dir := end - start
	var length := dir.length()
	if length <= 0.001:
		return {}
	var unit := dir / length
	var inset_a := minf(float(positions[a].radius) * 0.9, length * 0.45)
	var inset_b := minf(float(positions[b].radius) * 0.9, length * 0.45)
	start += unit * inset_a
	end -= unit * inset_b
	return {"start": start, "end": end}

func _draw_depth_blur(pos: Vector2, radius: float, fade: float, blur_strength: float) -> void:
	var fog := clampf(1.0 - fade, 0.0, 1.0)
	var base := _tint_color(color_circle, maxf(0.15, fade * 0.75)).lerp(color_bg, lerpf(0.45, 0.72, fog))
	var max_layers := mini(DEPTH_BLUR_STEPS, quality_blur_layer_cap)
	var layers := maxi(1, int(round(lerpf(1.0, float(max_layers), blur_strength))))
	for i in range(layers, 0, -1):
		var t := float(i) / float(layers)
		var blur_color := base
		var max_alpha := lerpf(0.03, 0.22, blur_strength)
		blur_color.a = max_alpha * t
		var spread := radius * lerpf(0.05, 0.55, blur_strength) * t
		var blur_radius := radius + spread
		if current_theme_id == THEME_TERMINAL:
			var rect_size := Vector2.ONE * blur_radius * 2.0
			draw_rect(Rect2(pos - rect_size * 0.5, rect_size), blur_color, true)
		else:
			draw_circle(pos, blur_radius, blur_color)

func _draw_dots(node_id: int, pos: Vector2, count: int, radius: float, color: Color) -> void:
	if count <= 0:
		dot_states.erase(node_id)
		return
	var dr: float = maxf(2.0, radius * 0.16)
	var spacing: float = radius * 0.36
	var target_offsets := _dot_offsets(count, spacing)
	var state: Dictionary = {}
	if dot_states.has(node_id):
		state = dot_states[node_id]
	if state.is_empty():
		state = {"count": count, "from": target_offsets, "to": target_offsets, "t": 1.0}
	else:
		if int(state.count) != count:
			var current_offsets := _interpolate_offsets(state.from, state.to, float(state.t))
			var mapped_from: Array = []
			for i in range(target_offsets.size()):
				if i < current_offsets.size():
					mapped_from.append(current_offsets[i])
				else:
					mapped_from.append(Vector2.ZERO)
			state = {"count": count, "from": mapped_from, "to": target_offsets, "t": 0.0}
	dot_states[node_id] = state
	var offsets := _interpolate_offsets(state.from, state.to, float(state.t))
	for i in range(min(count, offsets.size())):
		draw_circle(pos + offsets[i], dr, color)

func _dot_offsets(count: int, spacing: float) -> Array:
	var out: Array = []
	if count <= 0:
		return out
	if count == 1:
		out.append(Vector2.ZERO)
		return out
	if count == 2:
		out.append(Vector2(-spacing, 0.0))
		out.append(Vector2(spacing, 0.0))
		return out
	if count == 3:
		out.append(Vector2(0.0, -spacing * 0.9))
		out.append(Vector2(-spacing, spacing * 0.7))
		out.append(Vector2(spacing, spacing * 0.7))
		return out
	out.append(Vector2(-spacing, -spacing))
	out.append(Vector2(spacing, -spacing))
	out.append(Vector2(-spacing, spacing))
	out.append(Vector2(spacing, spacing))
	return out

func _interpolate_offsets(from: Array, to: Array, t: float) -> Array:
	var out: Array = []
	for i in range(to.size()):
		var a: Vector2 = Vector2.ZERO
		if i < from.size():
			a = from[i]
		var b: Vector2 = to[i]
		out.append(a.lerp(b, t))
	return out

func _float_offset(node_id: int) -> Vector3:
	var motion_signed := _vfx_motion_factor()
	var motion_mix := clampf(absf(motion_signed) * 0.5, 0.0, 1.0)
	var direction := -1.0 if motion_signed < 0.0 else 1.0
	var amp := cell_size * float_amp_factor * lerpf(0.25, 1.8, motion_mix)
	var seed := float(node_id)
	var motion := absf(motion_signed)
	var ox := sin(float_time * direction * (0.8 + motion * 0.5) + seed * 0.37) * amp
	var oy := cos(float_time * direction * (0.55 + motion * 0.4) + seed * 0.53) * amp * 0.8
	return Vector3(ox, oy, 0.0)

func get_front_face() -> int:
	return _front_face_for_basis(rotation_basis)

func snap_to_face(face_id: int) -> void:
	if rotation_active:
		return
	if model == null:
		return
	var target := _basis_for_front_face(face_id)
	_animate_to_basis(target)

func is_node_on_front_face(node_id: int) -> bool:
	return _is_node_on_front_face(node_id)

func best_face_for_node(node_id: int) -> int:
	if model == null:
		return FACE_FRONT
	var c := model.coords(node_id)
	var candidates: Array = []
	if c.z == 0:
		candidates.append(FACE_FRONT)
	if c.z == model.nz - 1:
		candidates.append(FACE_BACK)
	if c.x == 0:
		candidates.append(FACE_LEFT)
	if c.x == model.nx - 1:
		candidates.append(FACE_RIGHT)
	if c.y == 0:
		candidates.append(FACE_TOP)
	if c.y == model.ny - 1:
		candidates.append(FACE_BOTTOM)
	if candidates.is_empty():
		return get_front_face()
	var best_face: int = int(candidates[0])
	var best_z: float = -1e9
	for face_id in candidates:
		var face_val: int = int(face_id)
		var normal := _face_normal(face_val)
		var rn := rotation_basis * normal
		if rn.z > best_z:
			best_z = rn.z
			best_face = face_val
	return best_face

func _front_face_for_basis(basis: Basis) -> int:
	var normals := {
		FACE_FRONT: Vector3(0, 0, 1),
		FACE_BACK: Vector3(0, 0, -1),
		FACE_LEFT: Vector3(-1, 0, 0),
		FACE_RIGHT: Vector3(1, 0, 0),
		FACE_TOP: Vector3(0, 1, 0),
		FACE_BOTTOM: Vector3(0, -1, 0)
	}
	var best_face := FACE_FRONT
	var best_z := -1e9
	for face_id in normals.keys():
		var normal: Vector3 = normals[face_id]
		var rn: Vector3 = basis * normal
		if rn.z > best_z:
			best_z = rn.z
			best_face = face_id
	return best_face

func _face_normal(face_id: int) -> Vector3:
	match face_id:
		FACE_FRONT:
			return Vector3(0, 0, 1)
		FACE_BACK:
			return Vector3(0, 0, -1)
		FACE_LEFT:
			return Vector3(-1, 0, 0)
		FACE_RIGHT:
			return Vector3(1, 0, 0)
		FACE_TOP:
			return Vector3(0, 1, 0)
		FACE_BOTTOM:
			return Vector3(0, -1, 0)
		_:
			return Vector3(0, 0, 1)

func _basis_for_front_face(face_id: int) -> Basis:
	var candidates: Array = _candidate_orientations()
	var best: Basis = rotation_basis
	var best_score := -1e9
	for b in candidates:
		if _front_face_for_basis(b) != face_id:
			continue
		var score := rotation_basis.x.dot(b.x) + rotation_basis.y.dot(b.y) + rotation_basis.z.dot(b.z)
		if score > best_score:
			best_score = score
			best = b
	return best

func _fade_from_depth(z: float) -> float:
	var max_dim := maxi(maxi(model.nx, model.ny), model.nz)
	var range := float(max_dim) * cell_size * 0.8
	var t := clampf((z + range) / (2.0 * range), 0.0, 1.0)
	t = pow(t, 1.45)
	return lerpf(FADE_BACK, FADE_FRONT, t)

func _tint_color(base: Color, fade: float) -> Color:
	var t := clampf(1.0 - fade, 0.0, 1.0)
	var washed := base.lerp(color_bg, t * 0.85)
	var factor := lerpf(0.6, 1.0, fade)
	return Color(washed.r * factor, washed.g * factor, washed.b * factor, 1.0)

func _edge_color(fade: float) -> Color:
	var color := _tint_color(color_edge, fade)
	var fog := clampf(1.0 - fade, 0.0, 1.0)
	var fog_color := color_bg
	var fog_strength := lerpf(0.08, 0.52, fog)
	return color.lerp(fog_color, fog_strength)

func _is_node_on_front_face(node_id: int) -> bool:
	if model == null:
		return false
	if model.nz <= 1:
		return true
	var c := model.coords(node_id)
	match get_front_face():
		FACE_FRONT:
			return c.z == 0
		FACE_BACK:
			return c.z == model.nz - 1
		FACE_LEFT:
			return c.x == 0
		FACE_RIGHT:
			return c.x == model.nx - 1
		FACE_TOP:
			return c.y == 0
		FACE_BOTTOM:
			return c.y == model.ny - 1
		_:
			return false

func _node_face_z(c: Vector3i) -> float:
	var max_z := -1.0
	if c.x == 0:
		max_z = maxf(max_z, _rotate_vec(Vector3(-1, 0, 0)).z)
	if c.x == model.nx - 1:
		max_z = maxf(max_z, _rotate_vec(Vector3(1, 0, 0)).z)
	if c.y == 0:
		max_z = maxf(max_z, _rotate_vec(Vector3(0, 1, 0)).z)
	if c.y == model.ny - 1:
		max_z = maxf(max_z, _rotate_vec(Vector3(0, -1, 0)).z)
	if c.z == 0:
		max_z = maxf(max_z, _rotate_vec(Vector3(0, 0, 1)).z)
	if c.z == model.nz - 1:
		max_z = maxf(max_z, _rotate_vec(Vector3(0, 0, -1)).z)
	return max_z

func _node_position(c: Vector3i) -> Vector3:
	var center_x := float(model.nx - 1) * 0.5
	var center_y := float(model.ny - 1) * 0.5
	var center_z := float(model.nz - 1) * 0.5
	var px := float(c.x) - center_x
	var py := -(float(c.y) - center_y)
	var pz := (center_z - float(c.z))
	return Vector3(px, py, pz) * cell_size

func _rotate_vec(v: Vector3) -> Vector3:
	return rotation_basis * v

func _camera_distance() -> float:
	var max_dim := maxi(maxi(model.nx, model.ny), model.nz)
	return cell_size * max_dim * 2.6

func _best_orientation_basis() -> Basis:
	var candidates: Array = _candidate_orientations()
	var best: Basis = candidates[0]
	var best_score := -1e9
	for b in candidates:
		var score := rotation_basis.x.dot(b.x) + rotation_basis.y.dot(b.y) + rotation_basis.z.dot(b.z)
		if score > best_score:
			best_score = score
			best = b
	return best

func _candidate_orientations() -> Array:
	var out: Array = []
	var dirs := [
		Vector3(1, 0, 0), Vector3(-1, 0, 0),
		Vector3(0, 1, 0), Vector3(0, -1, 0),
		Vector3(0, 0, 1), Vector3(0, 0, -1)
	]
	for x in dirs:
		for y in dirs:
			if absf(x.dot(y)) > 0.001:
				continue
			var z: Vector3 = x.cross(y)
			if z.length() < 0.5:
				continue
			out.append(Basis(x, y, z))
	return out
