class_name GameController
extends Control

signal back_requested
signal visual_theme_changed(theme_id: int)

const DEBUG_LOG_PATH := "user://input_debug.log"
const ENABLE_INPUT_DEBUG_LOG := false
const START_WITH_UNSOLVED_CIRCLES := 3
const STARTUP_CONNECTION_ANIM_DELAY := 0.012

const DIFFICULTY_EASY := 0
const DIFFICULTY_NORMAL := 1
const DIFFICULTY_HARD := 2
const THEME_CLASSIC := GridView.THEME_CLASSIC
const THEME_WARM := GridView.THEME_WARM
const THEME_TERMINAL := GridView.THEME_TERMINAL
const POST_FX_SHADER := preload("res://shaders/post_fx_compositor.gdshader")
const POST_FX_VIGNETTE := "post_vignette"
const POST_FX_BLOOM_LIFT := "post_bloom_lift"
const POST_FX_GRAIN := "post_grain"
const POST_FX_CHROMATIC := "post_chromatic"
const POST_FX_SCANLINES := "post_scanlines"
const POST_FX_LENS_WARP := "post_lens_warp"
const POST_FX_COLOR_GRADE := "post_color_grade"
const VFX_PROFILE_DEFAULT_PATH := "res://config/vfx_defaults.json"
const VFX_PROFILE_USER_PATH := "user://vfx_profile.json"
const PARAM_ID_INTENSITY := "intensity"
const PARAM_ID_MOTION := "motion"
const PARAM_SCALE_LOG := "log"
const PARAM_SCALE_SIGNED_LOG := "signed_log"
const FX_INTENSITY_MAX := 6.0
const FX_MOTION_MAX := 6.0
const FX_MOTION_SIGNED_MAX := 4.0
const POST_FX_INTENSITY_MAX := 8.0
const POST_FX_MOTION_MAX := 6.0
const CONNECTION_VFX_PREVIEW_DEBOUNCE := 0.08
const CONNECTION_VFX_PREVIEW_DISCONNECT_DELAY := 0.2
const DEFAULT_POST_FX_FLAGS := {
	POST_FX_VIGNETTE: true,
	POST_FX_BLOOM_LIFT: true,
	POST_FX_GRAIN: true,
	POST_FX_CHROMATIC: true,
	POST_FX_SCANLINES: true,
	POST_FX_LENS_WARP: true,
	POST_FX_COLOR_GRADE: true
}
const DEFAULT_EFFECT_PROFILE := {"intensity": 1.0, "motion": 1.0}

var model: GridModel
var selected_id: int = -1
var current_size: int = 5
var current_depth: int = 1
var current_difficulty: int = DIFFICULTY_NORMAL
var swipe_active: bool = false
var swipe_start: Vector2 = Vector2.ZERO
var swipe_last: Vector2 = Vector2.ZERO
var swipe_total: Vector2 = Vector2.ZERO
var drag_moved: bool = false
var pan_accum: Vector2 = Vector2.ZERO
var pan_last_time: float = 0.0
var pan_block_until: float = 0.0
var pan_active: bool = false
var pan_end_deadline: float = 0.0
var use_polling_input: bool = false
var poll_mouse_active: bool = false
var poll_mouse_last: Vector2 = Vector2.ZERO
var key_state := {}
var last_event_time: float = 0.0
var last_motion_time: float = 0.0
var connect_drag_active: bool = false
var connect_anchor_id: int = -1
var connect_last_id: int = -1
var connect_moved: bool = false
var connect_start_pos: Vector2 = Vector2.ZERO
var total_required_edges: int = 0
var last_tap_time: float = 0.0
var last_tap_node: int = -1
var last_empty_tap_time: float = 0.0
var undo_stack: Array = []
var redo_stack: Array = []
var undo_pending: Dictionary = {}
var undo_waiting: bool = false
var suppress_record: bool = false
var undo_delayed_action: Dictionary = {}
const UNDO_ROTATE_DELAY := 0.12
var hint_pending: Dictionary = {}
var hint_waiting: bool = false
var hint_token: int = 0
const HINT_HOLD_TIME := 2.2
var startup_fill_in_progress: bool = false
var startup_fill_token: int = 0
var current_theme_id: int = THEME_CLASSIC
var developer_mode: bool = false
var dev_button: Button = null
var theme_button: Button = null
var vfx_button: Button = null
var vfx_popup: PopupPanel = null
var vfx_popup_header: Label = null
var vfx_dev_block: VBoxContainer = null
var vfx_effect_controls: Dictionary = {}
var vfx_dev_status: Label = null
var vfx_syncing_controls: bool = false
var post_fx_overlay: ColorRect = null
var post_fx_material: ShaderMaterial = null
var post_fx_flags: Dictionary = DEFAULT_POST_FX_FLAGS.duplicate(true)
var post_fx_profiles: Dictionary = {}
var post_fx_time: float = 0.0
var hint_hover_active: bool = false
var solve_hover_active: bool = false
var connection_vfx_preview_token: int = 0

@onready var grid_view: GridView = $GridView
@onready var hud_root: Control = $HUD/Root
@onready var top_bar: Control = $HUD/Root/TopBar
@onready var top_bar_hbox: HBoxContainer = $HUD/Root/TopBar/TopBarHBox
@onready var back_button: Button = $HUD/Root/TopBar/TopBarHBox/BackButton
@onready var restart_button: Button = $HUD/Root/TopBar/TopBarHBox/RestartButton
@onready var hint_button: Button = $HUD/Root/TopBar/TopBarHBox/HintButton
@onready var solve_button: Button = $HUD/Root/TopBar/TopBarHBox/SolveButton
@onready var side_label: Label = $HUD/Root/TopBar/TopBarHBox/SideLabel
@onready var control_hints_label: Label = $HUD/Root/ControlHints
@onready var completion_panel: Panel = $HUD/Root/CompletionPanel
@onready var completion_label: Label = $HUD/Root/CompletionPanel/CompletionVBox/CompletionLabel
@onready var next_button: Button = $HUD/Root/CompletionPanel/CompletionVBox/NextButton
@onready var replay_button: Button = $HUD/Root/CompletionPanel/CompletionVBox/ReplayButton
@onready var sfx_connect: AudioStreamPlayer = $Sfx/ConnectSfx
@onready var sfx_disconnect: AudioStreamPlayer = $Sfx/DisconnectSfx
@onready var sfx_complete: AudioStreamPlayer = $Sfx/CompleteSfx
@onready var sfx_ui: AudioStreamPlayer = $Sfx/UiSfx

func _ready() -> void:
	set_process_input(true)
	set_process(true)
	var launch_dev_requested := _launch_requests_dev_mode()
	developer_mode = launch_dev_requested
	_reset_post_fx_profiles()
	use_polling_input = OS.has_feature("web")
	if use_polling_input:
		Input.set_emulate_mouse_from_touch(true)
		_focus_canvas_web()
	back_button.pressed.connect(_on_back_pressed)
	restart_button.pressed.connect(_on_restart_pressed)
	hint_button.pressed.connect(_on_hint_pressed)
	solve_button.pressed.connect(_on_solve_pressed)
	next_button.pressed.connect(_on_back_pressed)
	replay_button.pressed.connect(_on_next_pressed)
	_ensure_post_fx_overlay()
	grid_view.set_vfx_intensity(1.0)
	grid_view.set_vfx_motion(1.0)
	_apply_developer_mode_visibility()
	_wire_ui_hover_effects()
	_update_ui_light_bias()
	completion_panel.visible = false
	if is_instance_valid(side_label):
		side_label.visible = true
	set_visual_theme(current_theme_id)
	_load_vfx_profiles()
	if launch_dev_requested:
		developer_mode = true
		_update_dev_button_text()
		_apply_developer_mode_visibility()
	_refresh_vfx_controls()
	_init_hud_scale()
	_log_debug("session start")

func set_visual_theme(theme_id: int) -> void:
	var normalized := clampi(theme_id, THEME_CLASSIC, THEME_TERMINAL)
	var changed := normalized != current_theme_id
	current_theme_id = normalized
	if is_instance_valid(grid_view):
		grid_view.set_theme(current_theme_id)
	_apply_post_fx_theme()
	_apply_hud_theme()
	_update_theme_button_text()
	_update_status_label()
	if changed:
		visual_theme_changed.emit(current_theme_id)

func _ensure_theme_button() -> void:
	if not is_instance_valid(top_bar_hbox):
		return
	if is_instance_valid(theme_button):
		return
	theme_button = Button.new()
	theme_button.name = "ThemeButton"
	theme_button.text = "Theme"
	theme_button.custom_minimum_size = Vector2(108, 52)
	theme_button.focus_mode = Control.FOCUS_NONE
	theme_button.add_theme_font_size_override("font_size", 18)
	theme_button.add_theme_stylebox_override("normal", solve_button.get_theme_stylebox("normal"))
	theme_button.add_theme_stylebox_override("pressed", solve_button.get_theme_stylebox("pressed"))
	theme_button.add_theme_stylebox_override("hover", solve_button.get_theme_stylebox("hover"))
	theme_button.pressed.connect(_on_theme_pressed)
	top_bar_hbox.add_child(theme_button)
	var solve_index := solve_button.get_index()
	top_bar_hbox.move_child(theme_button, solve_index + 1)

func _ensure_vfx_button() -> void:
	if not is_instance_valid(top_bar_hbox):
		return
	if is_instance_valid(vfx_button):
		return
	vfx_button = Button.new()
	vfx_button.name = "VfxButton"
	vfx_button.text = "VFX"
	vfx_button.custom_minimum_size = Vector2(96, 52)
	vfx_button.focus_mode = Control.FOCUS_NONE
	vfx_button.add_theme_font_size_override("font_size", 18)
	vfx_button.add_theme_stylebox_override("normal", solve_button.get_theme_stylebox("normal"))
	vfx_button.add_theme_stylebox_override("pressed", solve_button.get_theme_stylebox("pressed"))
	vfx_button.add_theme_stylebox_override("hover", solve_button.get_theme_stylebox("hover"))
	vfx_button.pressed.connect(_on_vfx_pressed)
	top_bar_hbox.add_child(vfx_button)
	var insert_index := solve_button.get_index() + 2
	if is_instance_valid(theme_button):
		insert_index = theme_button.get_index() + 1
	top_bar_hbox.move_child(vfx_button, insert_index)
	_ensure_vfx_popup()

func _ensure_dev_button() -> void:
	if not is_instance_valid(top_bar_hbox):
		return
	if is_instance_valid(dev_button):
		_update_dev_button_text()
		return
	dev_button = Button.new()
	dev_button.name = "DevButton"
	dev_button.custom_minimum_size = Vector2(92, 52)
	dev_button.focus_mode = Control.FOCUS_NONE
	dev_button.add_theme_font_size_override("font_size", 18)
	dev_button.add_theme_stylebox_override("normal", solve_button.get_theme_stylebox("normal"))
	dev_button.add_theme_stylebox_override("pressed", solve_button.get_theme_stylebox("pressed"))
	dev_button.add_theme_stylebox_override("hover", solve_button.get_theme_stylebox("hover"))
	dev_button.pressed.connect(_on_dev_pressed)
	top_bar_hbox.add_child(dev_button)
	var insert_index := vfx_button.get_index() + 1 if is_instance_valid(vfx_button) else solve_button.get_index() + 1
	top_bar_hbox.move_child(dev_button, insert_index)
	_update_dev_button_text()

func _update_dev_button_text() -> void:
	if not is_instance_valid(dev_button):
		return
	dev_button.text = "Dev On" if developer_mode else "Dev Off"

func _on_dev_pressed() -> void:
	developer_mode = not developer_mode
	_update_dev_button_text()
	_apply_developer_mode_visibility()
	_refresh_vfx_controls()
	_apply_hud_theme()
	_play_sfx(sfx_ui)

func _apply_developer_mode_visibility() -> void:
	var enabled := developer_mode
	if is_instance_valid(solve_button):
		solve_button.visible = false
	if is_instance_valid(theme_button):
		theme_button.visible = false
	if is_instance_valid(vfx_button):
		vfx_button.visible = false
	if is_instance_valid(dev_button):
		dev_button.visible = false
	if not enabled:
		solve_hover_active = false
		_hide_vfx_popup()
	_update_ui_light_bias()

func _launch_requests_dev_mode() -> bool:
	for arg_value in OS.get_cmdline_user_args():
		var arg := String(arg_value).strip_edges().to_lower()
		if arg == "--dev" or arg == "--developer-mode" or arg == "dev=1" or arg == "--dev=1":
			return true
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		var query := String(JavaScriptBridge.eval("window.location.search || ''", true)).to_lower()
		if query.find("dev=1") != -1 or query.find("developer=1") != -1:
			return true
	return false

func _post_fx_entries() -> Array:
	return [
		{"key": POST_FX_VIGNETTE, "label": "Post Vignette"},
		{"key": POST_FX_BLOOM_LIFT, "label": "Post Bloom Lift"},
		{"key": POST_FX_GRAIN, "label": "Film Grain"},
		{"key": POST_FX_CHROMATIC, "label": "Chromatic Fringe"},
		{"key": POST_FX_SCANLINES, "label": "Scanline Sweep"},
		{"key": POST_FX_LENS_WARP, "label": "Lens Warp"},
		{"key": POST_FX_COLOR_GRADE, "label": "Color Grade"}
	]

func _reset_post_fx_profiles() -> void:
	post_fx_profiles.clear()
	for entry in _post_fx_entries():
		var key := String(entry.get("key", ""))
		if key == "":
			continue
		post_fx_profiles[key] = DEFAULT_EFFECT_PROFILE.duplicate(true)

func _ensure_post_fx_profile_key(key: String) -> void:
	if post_fx_profiles.has(key):
		return
	post_fx_profiles[key] = DEFAULT_EFFECT_PROFILE.duplicate(true)

func _post_fx_profile_intensity(key: String) -> float:
	if not post_fx_profiles.has(key):
		return 1.0
	var profile: Dictionary = post_fx_profiles[key]
	return _clamp_param_value(float(profile.get("intensity", 1.0)), _effect_param_spec(key, PARAM_ID_INTENSITY))

func _post_fx_profile_motion(key: String) -> float:
	if not post_fx_profiles.has(key):
		return 1.0
	var profile: Dictionary = post_fx_profiles[key]
	return _clamp_param_value(float(profile.get("motion", 1.0)), _effect_param_spec(key, PARAM_ID_MOTION))

func _set_post_fx_profile_intensity(key: String, value: float) -> void:
	_ensure_post_fx_profile_key(key)
	var profile: Dictionary = post_fx_profiles[key]
	profile["intensity"] = _clamp_param_value(value, _effect_param_spec(key, PARAM_ID_INTENSITY))
	post_fx_profiles[key] = profile
	_apply_post_fx_runtime()

func _set_post_fx_profile_motion(key: String, value: float) -> void:
	_ensure_post_fx_profile_key(key)
	var profile: Dictionary = post_fx_profiles[key]
	profile["motion"] = _clamp_param_value(value, _effect_param_spec(key, PARAM_ID_MOTION))
	post_fx_profiles[key] = profile
	_apply_post_fx_runtime()

func _is_post_fx_key(key: String) -> bool:
	for entry in _post_fx_entries():
		if String(entry.get("key", "")) == key:
			return true
	return false

func _all_fx_entries() -> Array:
	var out: Array = []
	for entry in _post_fx_entries():
		out.append({"key": String(entry.get("key", "")), "label": String(entry.get("label", "")), "kind": "post"})
	for gameplay_entry in grid_view.vfx_entries():
		out.append({"key": String(gameplay_entry.get("key", "")), "label": String(gameplay_entry.get("label", "")), "kind": "gameplay"})
	return out

func _effect_param_specs(key: String) -> Array:
	if _is_post_fx_key(key):
		match key:
			POST_FX_BLOOM_LIFT:
				return [
					_param_spec(PARAM_ID_INTENSITY, "Amount", PARAM_SCALE_LOG, 0.0, 8.0)
				]
			POST_FX_GRAIN:
				return [
					_param_spec(PARAM_ID_INTENSITY, "Amount", PARAM_SCALE_LOG, 0.0, 6.0),
					_param_spec(PARAM_ID_MOTION, "Animation", PARAM_SCALE_LOG, 0.0, 6.0)
				]
			POST_FX_SCANLINES:
				return [
					_param_spec(PARAM_ID_INTENSITY, "Amount", PARAM_SCALE_LOG, 0.0, 7.0),
					_param_spec(PARAM_ID_MOTION, "Sweep", PARAM_SCALE_LOG, 0.0, 6.0)
				]
			POST_FX_LENS_WARP:
				return [
					_param_spec(PARAM_ID_INTENSITY, "Amount", PARAM_SCALE_LOG, 0.0, 4.0),
					_param_spec(PARAM_ID_MOTION, "Shimmer", PARAM_SCALE_LOG, 0.0, 6.0)
				]
			POST_FX_CHROMATIC:
				return [
					_param_spec(PARAM_ID_INTENSITY, "Amount", PARAM_SCALE_LOG, 0.0, 5.0)
				]
			_:
				return [
					_param_spec(PARAM_ID_INTENSITY, "Amount", PARAM_SCALE_LOG, 0.0, 4.0)
				]
	match key:
		GridView.VFX_EDGE_SWEEP:
			return [
				_param_spec(PARAM_ID_INTENSITY, "Beam", PARAM_SCALE_LOG, 0.0, FX_INTENSITY_MAX),
				_param_spec(PARAM_ID_MOTION, "Speed", PARAM_SCALE_LOG, 0.0, FX_MOTION_MAX)
			]
		GridView.VFX_PARALLAX_FOG:
			return [
				_param_spec(PARAM_ID_INTENSITY, "Density", PARAM_SCALE_LOG, 0.0, FX_INTENSITY_MAX),
				_param_spec(PARAM_ID_MOTION, "Drift", PARAM_SCALE_SIGNED_LOG, -FX_MOTION_SIGNED_MAX, FX_MOTION_SIGNED_MAX)
			]
		GridView.VFX_AMBIENT_PARTICLES:
			return [
				_param_spec(PARAM_ID_INTENSITY, "Density", PARAM_SCALE_LOG, 0.0, FX_INTENSITY_MAX),
				_param_spec(PARAM_ID_MOTION, "Drift", PARAM_SCALE_SIGNED_LOG, -FX_MOTION_SIGNED_MAX, FX_MOTION_SIGNED_MAX)
			]
		GridView.VFX_PHOSPHOR_TRAIL:
			return [
				_param_spec(PARAM_ID_INTENSITY, "Persistence", PARAM_SCALE_LOG, 0.0, FX_INTENSITY_MAX),
				_param_spec(PARAM_ID_MOTION, "Decay Speed", PARAM_SCALE_LOG, 0.0, FX_MOTION_MAX)
			]
		GridView.VFX_HEAT_SHIMMER:
			return [
				_param_spec(PARAM_ID_INTENSITY, "Distortion", PARAM_SCALE_LOG, 0.0, FX_INTENSITY_MAX),
				_param_spec(PARAM_ID_MOTION, "Flow", PARAM_SCALE_SIGNED_LOG, -FX_MOTION_SIGNED_MAX, FX_MOTION_SIGNED_MAX)
			]
		GridView.VFX_COMPLETION_SHOCKWAVE:
			return [
				_param_spec(PARAM_ID_INTENSITY, "Wave Strength", PARAM_SCALE_LOG, 0.0, FX_INTENSITY_MAX),
				_param_spec(PARAM_ID_MOTION, "Wave Speed", PARAM_SCALE_LOG, 0.0, FX_MOTION_MAX)
			]
		GridView.VFX_DISCONNECT_DISSOLVE:
			return [
				_param_spec(PARAM_ID_INTENSITY, "Fragment Strength", PARAM_SCALE_LOG, 0.0, FX_INTENSITY_MAX),
				_param_spec(PARAM_ID_MOTION, "Dissolve Speed", PARAM_SCALE_LOG, 0.0, FX_MOTION_MAX)
			]
		_:
			return [
				_param_spec(PARAM_ID_INTENSITY, "Amount", PARAM_SCALE_LOG, 0.0, FX_INTENSITY_MAX)
			]

func _param_spec(id: String, label: String, scale: String, min_value: float, max_value: float) -> Dictionary:
	return {
		"id": id,
		"label": label,
		"scale": scale,
		"min": min_value,
		"max": max_value
	}

func _effect_param_spec(key: String, param_id: String) -> Dictionary:
	for spec in _effect_param_specs(key):
		if String(spec.get("id", "")) == param_id:
			return spec
	return _param_spec(param_id, "Value", PARAM_SCALE_LOG, 0.0, FX_INTENSITY_MAX)

func _clamp_param_value(value: float, spec: Dictionary) -> float:
	var min_value := float(spec.get("min", 0.0))
	var max_value := float(spec.get("max", 1.0))
	return clampf(value, min_value, max_value)

func _slider_to_param_value(slider_value: float, spec: Dictionary) -> float:
	var s := clampf(slider_value, 0.0, 1.0)
	var min_value := float(spec.get("min", 0.0))
	var max_value := float(spec.get("max", 1.0))
	var scale := String(spec.get("scale", PARAM_SCALE_LOG))
	if scale == PARAM_SCALE_SIGNED_LOG and min_value < 0.0 and max_value > 0.0:
		var max_abs := maxf(absf(min_value), absf(max_value))
		var t := (s - 0.5) * 2.0
		if absf(t) < 0.00001:
			return 0.0
		var exp_scale := log(max_abs + 1.0)
		var magnitude := exp(exp_scale * absf(t)) - 1.0
		return clampf(sign(t) * magnitude, min_value, max_value)
	var shifted_max := maxf(0.001, max_value - min_value)
	var exp_scale := log(shifted_max + 1.0)
	var shifted := exp(exp_scale * s) - 1.0
	return clampf(min_value + shifted, min_value, max_value)

func _param_value_to_slider(value: float, spec: Dictionary) -> float:
	var min_value := float(spec.get("min", 0.0))
	var max_value := float(spec.get("max", 1.0))
	var v := clampf(value, min_value, max_value)
	var scale := String(spec.get("scale", PARAM_SCALE_LOG))
	if scale == PARAM_SCALE_SIGNED_LOG and min_value < 0.0 and max_value > 0.0:
		var max_abs := maxf(absf(min_value), absf(max_value))
		if max_abs <= 0.0001:
			return 0.5
		var magnitude := absf(v)
		if magnitude <= 0.00001:
			return 0.5
		var exp_scale := log(max_abs + 1.0)
		var t := log(magnitude + 1.0) / exp_scale
		return clampf(0.5 + sign(v) * 0.5 * t, 0.0, 1.0)
	var shifted_max := maxf(0.001, max_value - min_value)
	var shifted := maxf(0.0, v - min_value)
	var exp_scale := log(shifted_max + 1.0)
	return clampf(log(shifted + 1.0) / exp_scale, 0.0, 1.0)

func _format_param_value(value: float, spec: Dictionary) -> String:
	var scale := String(spec.get("scale", PARAM_SCALE_LOG))
	if scale == PARAM_SCALE_SIGNED_LOG:
		return "%+.2f" % value
	return "%.2f" % value

func _effect_param_value(key: String, param_id: String) -> float:
	match param_id:
		PARAM_ID_MOTION:
			return _effect_profile_motion(key)
		_:
			return _effect_profile_intensity(key)

func _set_effect_param_value(key: String, param_id: String, value: float) -> void:
	match param_id:
		PARAM_ID_MOTION:
			_set_effect_profile_motion(key, value)
		_:
			_set_effect_profile_intensity(key, value)

func _effect_profile_intensity(key: String) -> float:
	if _is_post_fx_key(key):
		return _post_fx_profile_intensity(key)
	return grid_view.get_vfx_profile_intensity(key)

func _effect_profile_motion(key: String) -> float:
	if _is_post_fx_key(key):
		return _post_fx_profile_motion(key)
	return grid_view.get_vfx_profile_motion(key)

func _set_effect_profile_intensity(key: String, value: float) -> void:
	var clamped := _clamp_param_value(value, _effect_param_spec(key, PARAM_ID_INTENSITY))
	if _is_post_fx_key(key):
		_set_post_fx_profile_intensity(key, clamped)
		_set_post_fx_enabled(key, clamped > 0.001)
	else:
		grid_view.set_vfx_profile_intensity(key, clamped)
		grid_view.set_vfx_enabled(key, clamped > 0.001)
		_update_ui_light_bias()

func _set_effect_profile_motion(key: String, value: float) -> void:
	var clamped := _clamp_param_value(value, _effect_param_spec(key, PARAM_ID_MOTION))
	if _is_post_fx_key(key):
		_set_post_fx_profile_motion(key, clamped)
	else:
		grid_view.set_vfx_profile_motion(key, clamped)

func _sync_vfx_flags_from_profiles() -> void:
	for entry in grid_view.vfx_entries():
		var key := String(entry.get("key", ""))
		if key == "":
			continue
		grid_view.set_vfx_enabled(key, grid_view.get_vfx_profile_intensity(key) > 0.001)
	for entry in _post_fx_entries():
		var key := String(entry.get("key", ""))
		if key == "":
			continue
		_ensure_post_fx_profile_key(key)
		post_fx_flags[key] = _post_fx_profile_intensity(key) > 0.001
	_update_ui_light_bias()
	_apply_post_fx_runtime()

func _ensure_post_fx_overlay() -> void:
	if is_instance_valid(post_fx_overlay):
		return
	post_fx_overlay = ColorRect.new()
	post_fx_overlay.name = "PostFxOverlay"
	post_fx_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	post_fx_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	post_fx_overlay.focus_mode = Control.FOCUS_NONE
	post_fx_overlay.color = Color.WHITE
	post_fx_overlay.visible = true
	post_fx_material = ShaderMaterial.new()
	post_fx_material.shader = POST_FX_SHADER
	post_fx_overlay.material = post_fx_material
	add_child(post_fx_overlay)
	if is_instance_valid(grid_view):
		var overlay_index := mini(get_child_count() - 1, grid_view.get_index() + 1)
		move_child(post_fx_overlay, overlay_index)
	_apply_post_fx_theme()
	_apply_post_fx_runtime()

func _post_fx_enabled(key: String) -> bool:
	if not post_fx_flags.has(key):
		return false
	return bool(post_fx_flags[key])

func _set_post_fx_enabled(key: String, enabled: bool) -> void:
	_ensure_post_fx_profile_key(key)
	post_fx_flags[key] = enabled
	_apply_post_fx_runtime()

func _any_post_fx_enabled() -> bool:
	for value in post_fx_flags.values():
		if bool(value):
			return true
	return false

func _apply_post_fx_theme() -> void:
	if not is_instance_valid(post_fx_material):
		return
	post_fx_material.set_shader_parameter("theme", current_theme_id)

func _apply_post_fx_runtime() -> void:
	if not is_instance_valid(post_fx_material):
		return
	var master_intensity := clampf(grid_view.get_vfx_intensity(), 0.0, POST_FX_INTENSITY_MAX)
	var master_motion := clampf(grid_view.get_vfx_motion(), 0.0, POST_FX_MOTION_MAX)
	var vignette_i := _post_fx_profile_intensity(POST_FX_VIGNETTE) * master_intensity
	var bloom_i := _post_fx_profile_intensity(POST_FX_BLOOM_LIFT) * master_intensity
	var grain_i := _post_fx_profile_intensity(POST_FX_GRAIN) * master_intensity
	var chroma_i := _post_fx_profile_intensity(POST_FX_CHROMATIC) * master_intensity
	var scan_i := _post_fx_profile_intensity(POST_FX_SCANLINES) * master_intensity
	var warp_i := _post_fx_profile_intensity(POST_FX_LENS_WARP) * master_intensity
	var grade_i := _post_fx_profile_intensity(POST_FX_COLOR_GRADE) * master_intensity
	post_fx_material.set_shader_parameter("time_offset", post_fx_time)
	post_fx_material.set_shader_parameter("intensity", master_intensity)
	post_fx_material.set_shader_parameter("motion", master_motion)
	post_fx_material.set_shader_parameter("effect_mix", 1.0 if _any_post_fx_enabled() else 0.0)
	post_fx_material.set_shader_parameter("fx_vignette", vignette_i if _post_fx_enabled(POST_FX_VIGNETTE) else 0.0)
	post_fx_material.set_shader_parameter("fx_bloom_lift", bloom_i if _post_fx_enabled(POST_FX_BLOOM_LIFT) else 0.0)
	post_fx_material.set_shader_parameter("fx_grain", grain_i if _post_fx_enabled(POST_FX_GRAIN) else 0.0)
	post_fx_material.set_shader_parameter("fx_chromatic", chroma_i if _post_fx_enabled(POST_FX_CHROMATIC) else 0.0)
	post_fx_material.set_shader_parameter("fx_scanlines", scan_i if _post_fx_enabled(POST_FX_SCANLINES) else 0.0)
	post_fx_material.set_shader_parameter("fx_lens_warp", warp_i if _post_fx_enabled(POST_FX_LENS_WARP) else 0.0)
	post_fx_material.set_shader_parameter("fx_color_grade", grade_i if _post_fx_enabled(POST_FX_COLOR_GRADE) else 0.0)
	post_fx_material.set_shader_parameter("fx_vignette_motion", _post_fx_profile_motion(POST_FX_VIGNETTE) * master_motion)
	post_fx_material.set_shader_parameter("fx_bloom_lift_motion", _post_fx_profile_motion(POST_FX_BLOOM_LIFT) * master_motion)
	post_fx_material.set_shader_parameter("fx_grain_motion", _post_fx_profile_motion(POST_FX_GRAIN) * master_motion)
	post_fx_material.set_shader_parameter("fx_chromatic_motion", _post_fx_profile_motion(POST_FX_CHROMATIC) * master_motion)
	post_fx_material.set_shader_parameter("fx_scanlines_motion", _post_fx_profile_motion(POST_FX_SCANLINES) * master_motion)
	post_fx_material.set_shader_parameter("fx_lens_warp_motion", _post_fx_profile_motion(POST_FX_LENS_WARP) * master_motion)
	post_fx_material.set_shader_parameter("fx_color_grade_motion", _post_fx_profile_motion(POST_FX_COLOR_GRADE) * master_motion)
	if is_instance_valid(post_fx_overlay):
		post_fx_overlay.visible = _any_post_fx_enabled()

func _ensure_vfx_popup() -> void:
	if is_instance_valid(vfx_popup):
		return
	vfx_popup = PopupPanel.new()
	vfx_popup.name = "VfxPopup"
	vfx_popup.visible = false
	add_child(vfx_popup)
	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_bottom", 10)
	vfx_popup.add_child(margin)
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(root)
	var header := Label.new()
	header.text = "Live VFX Toggle"
	header.add_theme_font_size_override("font_size", 20)
	root.add_child(header)
	vfx_popup_header = header
	var presets := HBoxContainer.new()
	presets.add_theme_constant_override("separation", 8)
	root.add_child(presets)
	var subtle := Button.new()
	subtle.text = "Subtle"
	subtle.focus_mode = Control.FOCUS_NONE
	subtle.custom_minimum_size = Vector2(90, 32)
	subtle.pressed.connect(func() -> void:
		_apply_vfx_preset("subtle")
	)
	presets.add_child(subtle)
	var balanced := Button.new()
	balanced.text = "Balanced"
	balanced.focus_mode = Control.FOCUS_NONE
	balanced.custom_minimum_size = Vector2(96, 32)
	balanced.pressed.connect(func() -> void:
		_apply_vfx_preset("balanced")
	)
	presets.add_child(balanced)
	var cinematic := Button.new()
	cinematic.text = "Cinematic"
	cinematic.focus_mode = Control.FOCUS_NONE
	cinematic.custom_minimum_size = Vector2(104, 32)
	cinematic.pressed.connect(func() -> void:
		_apply_vfx_preset("cinematic")
	)
	presets.add_child(cinematic)
	vfx_dev_block = VBoxContainer.new()
	vfx_dev_block.add_theme_constant_override("separation", 6)
	vfx_dev_block.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vfx_dev_block.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(vfx_dev_block)
	var dev_header := Label.new()
	dev_header.text = "Developer Mode"
	dev_header.add_theme_font_size_override("font_size", 18)
	vfx_dev_block.add_child(dev_header)
	var save_actions := HBoxContainer.new()
	save_actions.add_theme_constant_override("separation", 8)
	vfx_dev_block.add_child(save_actions)
	var save_profile := Button.new()
	save_profile.text = "Save Profile"
	save_profile.focus_mode = Control.FOCUS_NONE
	save_profile.custom_minimum_size = Vector2(114, 32)
	save_profile.pressed.connect(_on_save_vfx_profile_pressed)
	save_actions.add_child(save_profile)
	var load_profile := Button.new()
	load_profile.text = "Load Profile"
	load_profile.focus_mode = Control.FOCUS_NONE
	load_profile.custom_minimum_size = Vector2(114, 32)
	load_profile.pressed.connect(_on_load_vfx_profile_pressed)
	save_actions.add_child(load_profile)
	vfx_dev_status = Label.new()
	vfx_dev_status.text = "Profile: user://vfx_profile.json"
	vfx_dev_status.add_theme_font_size_override("font_size", 14)
	vfx_dev_block.add_child(vfx_dev_status)
	var mixer_header := Label.new()
	mixer_header.text = "Per-Effect Mix"
	mixer_header.add_theme_font_size_override("font_size", 16)
	vfx_dev_block.add_child(mixer_header)
	var mixer_scroll := ScrollContainer.new()
	mixer_scroll.custom_minimum_size = Vector2(0, 420)
	mixer_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mixer_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	mixer_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	mixer_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vfx_dev_block.add_child(mixer_scroll)
	var mixer_box := VBoxContainer.new()
	mixer_box.add_theme_constant_override("separation", 8)
	mixer_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mixer_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mixer_scroll.add_child(mixer_box)
	vfx_effect_controls.clear()
	for entry in _all_fx_entries():
		var key := String(entry.get("key", ""))
		if key == "":
			continue
		var kind := String(entry.get("kind", "gameplay"))
		var title := String(entry.get("label", key))
		if kind == "post":
			title = "POST: %s" % title
		var block := VBoxContainer.new()
		block.add_theme_constant_override("separation", 4)
		block.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		mixer_box.add_child(block)
		var title_label := Label.new()
		title_label.text = title
		title_label.add_theme_font_size_override("font_size", 15)
		block.add_child(title_label)
		var params: Dictionary = {}
		for spec_variant in _effect_param_specs(key):
			if typeof(spec_variant) != TYPE_DICTIONARY:
				continue
			var spec: Dictionary = spec_variant
			var param_id := String(spec.get("id", ""))
			if param_id == "":
				continue
			var top_row := HBoxContainer.new()
			top_row.add_theme_constant_override("separation", 8)
			block.add_child(top_row)
			var param_label := Label.new()
			param_label.text = String(spec.get("label", "Value"))
			param_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			top_row.add_child(param_label)
			var value_label := Label.new()
			value_label.custom_minimum_size = Vector2(80, 0)
			value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			top_row.add_child(value_label)
			var slider := HSlider.new()
			slider.min_value = 0.0
			slider.max_value = 1.0
			slider.step = 0.001
			slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			slider.value_changed.connect(_on_vfx_effect_param_changed.bind(key, param_id))
			block.add_child(slider)
			params[param_id] = {
				"slider": slider,
				"value": value_label,
				"spec": spec
			}
		vfx_effect_controls[key] = {"params": params}
		var divider := HSeparator.new()
		mixer_box.add_child(divider)

func _wire_ui_hover_effects() -> void:
	hint_button.mouse_entered.connect(_on_hint_hover_entered)
	hint_button.mouse_exited.connect(_on_hint_hover_exited)
	solve_button.mouse_entered.connect(_on_solve_hover_entered)
	solve_button.mouse_exited.connect(_on_solve_hover_exited)

func _on_theme_pressed() -> void:
	if not developer_mode:
		return
	_play_sfx(sfx_ui)
	var next_theme := (current_theme_id + 1) % 3
	set_visual_theme(next_theme)

func _on_vfx_pressed() -> void:
	if not developer_mode:
		return
	_play_sfx(sfx_ui)
	if not is_instance_valid(vfx_popup):
		return
	if vfx_popup.visible:
		vfx_popup.hide()
		return
	_refresh_vfx_controls()
	var popup_size := Vector2i(356, mini(620, int(get_viewport_rect().size.y * 0.78)))
	var view_size := get_viewport_rect().size
	var x := int(clampf(view_size.x - float(popup_size.x) - 12.0, 8.0, view_size.x - float(popup_size.x) - 8.0))
	var preferred_y := vfx_button.get_global_position().y + vfx_button.size.y + 8.0
	var y := int(clampf(preferred_y, 8.0, view_size.y - float(popup_size.y) - 8.0))
	vfx_popup.popup(Rect2i(x, y, popup_size.x, popup_size.y))

func _refresh_vfx_controls() -> void:
	vfx_syncing_controls = true
	if is_instance_valid(vfx_dev_block):
		vfx_dev_block.visible = developer_mode
	_refresh_effect_profile_controls()
	vfx_syncing_controls = false
	_apply_post_fx_runtime()

func _refresh_effect_profile_controls() -> void:
	for key_variant in vfx_effect_controls.keys():
		var key := String(key_variant)
		var refs_variant: Variant = vfx_effect_controls[key]
		if typeof(refs_variant) != TYPE_DICTIONARY:
			continue
		var refs: Dictionary = refs_variant
		var params_variant: Variant = refs.get("params", {})
		if typeof(params_variant) != TYPE_DICTIONARY:
			continue
		var params: Dictionary = params_variant
		for param_variant in params.keys():
			var param_id := String(param_variant)
			var param_refs_variant: Variant = params[param_id]
			if typeof(param_refs_variant) != TYPE_DICTIONARY:
				continue
			var param_refs: Dictionary = param_refs_variant
			var slider := param_refs.get("slider", null) as HSlider
			var value_label := param_refs.get("value", null) as Label
			var spec_variant: Variant = param_refs.get("spec", {})
			if typeof(spec_variant) != TYPE_DICTIONARY:
				continue
			var spec: Dictionary = spec_variant
			var value := _effect_param_value(key, param_id)
			if is_instance_valid(slider):
				slider.value = _param_value_to_slider(value, spec)
			if is_instance_valid(value_label):
				value_label.text = _format_param_value(value, spec)

func _on_vfx_effect_param_changed(slider_value: float, key: String, param_id: String) -> void:
	if vfx_syncing_controls:
		return
	if key == "" or param_id == "":
		return
	var refs_variant: Variant = vfx_effect_controls.get(key, {})
	if typeof(refs_variant) != TYPE_DICTIONARY:
		return
	var refs: Dictionary = refs_variant
	var params_variant: Variant = refs.get("params", {})
	if typeof(params_variant) != TYPE_DICTIONARY:
		return
	var params: Dictionary = params_variant
	var param_refs_variant: Variant = params.get(param_id, {})
	if typeof(param_refs_variant) != TYPE_DICTIONARY:
		return
	var param_refs: Dictionary = param_refs_variant
	var spec_variant: Variant = param_refs.get("spec", {})
	if typeof(spec_variant) != TYPE_DICTIONARY:
		return
	var spec: Dictionary = spec_variant
	var value := _slider_to_param_value(slider_value, spec)
	_set_effect_param_value(key, param_id, value)
	var value_label := param_refs.get("value", null) as Label
	if is_instance_valid(value_label):
		value_label.text = _format_param_value(_effect_param_value(key, param_id), spec)
	if _is_connection_preview_effect_key(key):
		_request_connection_vfx_preview()

func _is_connection_preview_effect_key(key: String) -> bool:
	return key == GridView.VFX_EDGE_SWEEP \
		or key == GridView.VFX_CONNECT_RIPPLE \
		or key == GridView.VFX_PHOSPHOR_TRAIL \
		or key == GridView.VFX_DISCONNECT_DISSOLVE

func _request_connection_vfx_preview() -> void:
	connection_vfx_preview_token += 1
	var token := connection_vfx_preview_token
	_run_connection_vfx_preview(token)

func _run_connection_vfx_preview(token: int) -> void:
	await get_tree().create_timer(CONNECTION_VFX_PREVIEW_DEBOUNCE).timeout
	if token != connection_vfx_preview_token:
		return
	var edge := _find_connection_vfx_preview_edge()
	if edge.x < 0 or edge.y < 0:
		return
	_emit_edge_vfx(edge.x, edge.y, true)
	await get_tree().create_timer(CONNECTION_VFX_PREVIEW_DISCONNECT_DELAY).timeout
	if token != connection_vfx_preview_token:
		return
	_emit_edge_vfx(edge.x, edge.y, false)

func _find_connection_vfx_preview_edge() -> Vector2i:
	if model == null:
		return Vector2i(-1, -1)
	for key_variant in model.placed_edges.keys():
		var pair := model.decode_edge(int(key_variant))
		if pair.x >= 0 and pair.y >= 0:
			return pair
	for node_id in range(model.total_nodes()):
		if not model.is_active(node_id):
			continue
		if model.required[node_id] <= 0:
			continue
		var nbs := model.neighbors(node_id)
		if nbs.is_empty():
			continue
		return Vector2i(node_id, int(nbs[0]))
	for node_id in range(model.total_nodes()):
		if not model.is_active(node_id):
			continue
		var nbs := model.neighbors(node_id)
		if nbs.is_empty():
			continue
		return Vector2i(node_id, int(nbs[0]))
	return Vector2i(-1, -1)

func _apply_vfx_preset(preset: String) -> void:
	_set_all_effect_profiles(1.0, 1.0)
	match preset:
		"subtle":
			_set_all_effect_profiles(0.0, 0.7)
			for key in [
				GridView.VFX_SHADER_BG,
				GridView.VFX_PARALLAX_FOG,
				GridView.VFX_AMBIENT_PARTICLES,
				GridView.VFX_HINT_BEACON,
				GridView.VFX_UI_LIGHT_COUPLING
			]:
				grid_view.set_vfx_profile_intensity(key, 0.75)
				grid_view.set_vfx_profile_motion(key, 0.75)
			for key in [
				POST_FX_VIGNETTE,
				POST_FX_BLOOM_LIFT,
				POST_FX_COLOR_GRADE
			]:
				_set_post_fx_profile_intensity(key, 0.75)
				_set_post_fx_profile_motion(key, 0.75)
		"balanced":
			_set_post_fx_profile_intensity(POST_FX_CHROMATIC, 0.0)
			_set_post_fx_profile_intensity(POST_FX_LENS_WARP, 0.0)
		"cinematic":
			_set_all_effect_profiles(1.25, 1.15)
			_set_post_fx_profile_intensity(POST_FX_CHROMATIC, 0.9)
			_set_post_fx_profile_intensity(POST_FX_LENS_WARP, 0.9)
		_:
			_set_all_effect_profiles(1.0, 1.0)
	_sync_vfx_flags_from_profiles()
	_refresh_vfx_controls()
	_update_ui_light_bias()

func _set_all_effect_profiles(intensity: float, motion: float) -> void:
	for entry in grid_view.vfx_entries():
		var key := String(entry.get("key", ""))
		if key == "":
			continue
		grid_view.set_vfx_profile_intensity(key, intensity)
		grid_view.set_vfx_profile_motion(key, motion)
	for entry in _post_fx_entries():
		var key := String(entry.get("key", ""))
		if key == "":
			continue
		_set_post_fx_profile_intensity(key, intensity)
		_set_post_fx_profile_motion(key, motion)

func _capture_vfx_profile() -> Dictionary:
	return {
		"version": 1,
		"developer_mode": developer_mode,
		"gameplay": {
			"profiles": grid_view.get_vfx_profiles_snapshot()
		},
		"post": {
			"profiles": post_fx_profiles.duplicate(true)
		}
	}

func _write_json_profile(path: String, data: Dictionary) -> int:
	var dir_path := path.get_base_dir()
	if dir_path != "":
		var abs_dir := ProjectSettings.globalize_path(dir_path)
		DirAccess.make_dir_recursive_absolute(abs_dir)
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return ERR_CANT_OPEN
	file.store_string(JSON.stringify(data, "\t"))
	return OK

func _read_json_profile(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {}
	var raw := file.get_as_text()
	var json := JSON.new()
	if json.parse(raw) != OK:
		return {}
	if typeof(json.data) != TYPE_DICTIONARY:
		return {}
	return json.data

func _apply_vfx_profile(profile: Dictionary) -> bool:
	if profile.is_empty():
		return false
	if profile.has("developer_mode"):
		developer_mode = bool(profile["developer_mode"])
	var gameplay_value: Variant = profile.get("gameplay", {})
	if typeof(gameplay_value) == TYPE_DICTIONARY:
		var gameplay: Dictionary = gameplay_value
		var profiles_value: Variant = gameplay.get("profiles", {})
		if typeof(profiles_value) == TYPE_DICTIONARY:
			var profiles: Dictionary = profiles_value
			for key in profiles.keys():
				var k := String(key)
				if not grid_view.has_vfx_key(k):
					continue
				var value: Variant = profiles[key]
				if typeof(value) != TYPE_DICTIONARY:
					continue
				var effect_profile: Dictionary = value
				if effect_profile.has("intensity"):
					grid_view.set_vfx_profile_intensity(k, float(effect_profile["intensity"]))
				if effect_profile.has("motion"):
					grid_view.set_vfx_profile_motion(k, float(effect_profile["motion"]))
	var post_value: Variant = profile.get("post", {})
	if typeof(post_value) == TYPE_DICTIONARY:
		var post: Dictionary = post_value
		var post_profiles_data_value: Variant = post.get("profiles", {})
		if typeof(post_profiles_data_value) == TYPE_DICTIONARY:
			var post_profiles_data: Dictionary = post_profiles_data_value
			for key in post_profiles_data.keys():
				var k := String(key)
				if not _is_post_fx_key(k):
					continue
				var value: Variant = post_profiles_data[key]
				if typeof(value) != TYPE_DICTIONARY:
					continue
				var effect_profile: Dictionary = value
				if effect_profile.has("intensity"):
					_set_post_fx_profile_intensity(k, float(effect_profile["intensity"]))
				if effect_profile.has("motion"):
					_set_post_fx_profile_motion(k, float(effect_profile["motion"]))
	grid_view.set_vfx_intensity(1.0)
	grid_view.set_vfx_motion(1.0)
	_sync_vfx_flags_from_profiles()
	_update_dev_button_text()
	_apply_developer_mode_visibility()
	_apply_hud_theme()
	_refresh_vfx_controls()
	_update_ui_light_bias()
	_apply_post_fx_runtime()
	return true

func _load_vfx_profiles() -> void:
	var loaded_any := false
	var default_profile := _read_json_profile(VFX_PROFILE_DEFAULT_PATH)
	if _apply_vfx_profile(default_profile):
		loaded_any = true
	var user_profile := _read_json_profile(VFX_PROFILE_USER_PATH)
	if _apply_vfx_profile(user_profile):
		loaded_any = true
	if loaded_any:
		_set_vfx_dev_status("Profile loaded")

func _on_save_vfx_profile_pressed() -> void:
	var profile := _capture_vfx_profile()
	var user_err := _write_json_profile(VFX_PROFILE_USER_PATH, profile)
	var default_err := _write_json_profile(VFX_PROFILE_DEFAULT_PATH, profile)
	if user_err == OK and default_err == OK:
		_set_vfx_dev_status("Saved to user + project defaults")
	elif user_err == OK:
		_set_vfx_dev_status("Saved to user:// (project default write unavailable)")
	else:
		_set_vfx_dev_status("Save failed")

func _on_load_vfx_profile_pressed() -> void:
	var user_profile := _read_json_profile(VFX_PROFILE_USER_PATH)
	if _apply_vfx_profile(user_profile):
		_set_vfx_dev_status("Loaded from user profile")
		return
	var default_profile := _read_json_profile(VFX_PROFILE_DEFAULT_PATH)
	if _apply_vfx_profile(default_profile):
		_set_vfx_dev_status("Loaded from project defaults")
		return
	_set_vfx_dev_status("No profile found")

func _set_vfx_dev_status(message: String) -> void:
	if is_instance_valid(vfx_dev_status):
		vfx_dev_status.text = message

func _on_hint_hover_entered() -> void:
	hint_hover_active = true
	_update_ui_light_bias()

func _on_hint_hover_exited() -> void:
	hint_hover_active = false
	_update_ui_light_bias()

func _on_solve_hover_entered() -> void:
	solve_hover_active = true
	_update_ui_light_bias()

func _on_solve_hover_exited() -> void:
	solve_hover_active = false
	_update_ui_light_bias()

func _update_ui_light_bias() -> void:
	var strength := 0.0
	if solve_hover_active and is_instance_valid(solve_button) and solve_button.is_visible_in_tree():
		strength = maxf(strength, 0.82)
	grid_view.set_ui_light_bias(strength)

func _emit_edge_vfx(a: int, b: int, connected: bool) -> void:
	grid_view.trigger_edge_feedback(a, b, connected)

func _update_theme_button_text() -> void:
	if not is_instance_valid(theme_button):
		return
	match current_theme_id:
		THEME_WARM:
			theme_button.text = "Warm"
		THEME_TERMINAL:
			theme_button.text = "ASCII"
		_:
			theme_button.text = "Classic"

func _apply_hud_theme() -> void:
	var accent := _theme_accent_color()
	var text_dim := _theme_dim_color()
	var text_dark := _theme_dark_text_color()
	var popup_text := accent
	var popup_bg := Color(0.02, 0.07, 0.05, 0.96)
	match current_theme_id:
		THEME_WARM:
			popup_text = Color("#FFD79F")
			popup_bg = Color(0.09, 0.06, 0.03, 0.96)
		THEME_TERMINAL:
			popup_text = Color("#8EFAAA")
			popup_bg = Color(0.01, 0.08, 0.05, 0.96)
		_:
			popup_text = Color("#DCE7F4")
			popup_bg = Color(0.11, 0.14, 0.18, 0.96)
	var targets: Array = [back_button, restart_button, hint_button, solve_button, next_button, replay_button]
	if is_instance_valid(theme_button):
		targets.append(theme_button)
	if is_instance_valid(vfx_button):
		targets.append(vfx_button)
	if is_instance_valid(dev_button):
		targets.append(dev_button)
	for node in targets:
		if node == null:
			continue
		node.add_theme_color_override("font_color", accent)
		node.add_theme_color_override("font_hover_color", accent)
		node.add_theme_color_override("font_pressed_color", accent)
	var nav_icon_color := hint_button.get_theme_color("font_color") if is_instance_valid(hint_button) else accent
	for icon_button in [back_button, restart_button]:
		if not is_instance_valid(icon_button):
			continue
		icon_button.add_theme_color_override("icon_normal_color", nav_icon_color)
		icon_button.add_theme_color_override("icon_hover_color", nav_icon_color)
		icon_button.add_theme_color_override("icon_pressed_color", nav_icon_color)
		icon_button.add_theme_color_override("icon_focus_color", nav_icon_color)
		icon_button.add_theme_color_override("icon_disabled_color", text_dim)
	if is_instance_valid(vfx_popup):
		for lbl_node in vfx_popup.find_children("*", "Label", true, false):
			var lbl := lbl_node as Label
			if lbl == null:
				continue
			lbl.add_theme_color_override("font_color", popup_text)
		for btn_node in vfx_popup.find_children("*", "Button", true, false):
			var btn := btn_node as Button
			if btn == null:
				continue
			btn.add_theme_color_override("font_color", popup_text)
			btn.add_theme_color_override("font_hover_color", popup_text)
			btn.add_theme_color_override("font_pressed_color", popup_text)
		for option_node in vfx_popup.find_children("*", "OptionButton", true, false):
			var option := option_node as OptionButton
			if option == null:
				continue
			option.add_theme_color_override("font_color", popup_text)
			option.add_theme_color_override("font_hover_color", popup_text)
			option.add_theme_color_override("font_pressed_color", popup_text)
		for slider_node in vfx_popup.find_children("*", "HSlider", true, false):
			var slider := slider_node as HSlider
			if slider == null:
				continue
			slider.modulate = popup_text
			var panel := StyleBoxFlat.new()
			panel.bg_color = popup_bg
			panel.border_width_left = 2
			panel.border_width_top = 2
			panel.border_width_right = 2
			panel.border_width_bottom = 2
			panel.border_color = accent
			panel.corner_radius_top_left = 14
			panel.corner_radius_top_right = 14
			panel.corner_radius_bottom_right = 14
			panel.corner_radius_bottom_left = 14
			vfx_popup.add_theme_stylebox_override("panel", panel)
	if is_instance_valid(control_hints_label):
		control_hints_label.add_theme_color_override("font_color", text_dim)
	if is_instance_valid(completion_label):
		completion_label.add_theme_color_override("font_color", accent)
	if is_instance_valid(side_label):
		side_label.add_theme_color_override("font_color", text_dark)

func _theme_accent_color() -> Color:
	match current_theme_id:
		THEME_WARM:
			return Color("#FFC77F")
		THEME_TERMINAL:
			return Color("#8EFAAA")
		_:
			return Color("#3B4E52")

func _theme_dim_color() -> Color:
	match current_theme_id:
		THEME_WARM:
			return Color("#B7916B")
		THEME_TERMINAL:
			return Color("#58A66B")
		_:
			return Color("#68747A")

func _theme_dark_text_color() -> Color:
	match current_theme_id:
		THEME_WARM:
			return Color("#DCA978")
		THEME_TERMINAL:
			return Color("#5FCF7A")
		_:
			return Color("#526066")

func set_hud_visible(visible: bool) -> void:
	if has_node("HUD"):
		$HUD.visible = visible

func _init_hud_scale() -> void:
	var viewport := get_viewport()
	if viewport != null:
		viewport.size_changed.connect(_update_hud_scale)
	call_deferred("_update_hud_scale")

func _hud_scale_factor() -> float:
	if not OS.has_feature("web"):
		return 1.0
	if not DisplayServer.is_touchscreen_available():
		return 1.0
	var size := get_viewport_rect().size
	var short_side := minf(size.x, size.y)
	if short_side <= 420.0:
		return 1.35
	if short_side <= 520.0:
		return 1.25
	return 1.15

func _update_hud_scale() -> void:
	if not is_instance_valid(hud_root):
		return
	var scale := _hud_scale_factor()
	if is_instance_valid(top_bar):
		top_bar.pivot_offset = Vector2.ZERO
		top_bar.scale = Vector2(scale, scale)
	if is_instance_valid(completion_panel):
		completion_panel.pivot_offset = completion_panel.size * 0.5
		completion_panel.scale = Vector2(scale, scale)

func start_new_game(size: int, depth: int, difficulty: int) -> void:
	current_size = size
	current_depth = depth
	current_difficulty = difficulty
	selected_id = -1
	undo_stack.clear()
	redo_stack.clear()
	undo_pending = {}
	undo_waiting = false
	undo_delayed_action = {}
	hint_pending = {}
	hint_waiting = false
	hint_token += 1
	_generate_model(-1)
	completion_panel.visible = false
	grid_view.selected_id = -1
	grid_view.hint_id = -1
	grid_view.hint_ids = []
	grid_view.queue_redraw()
	_release_ui_focus()

func _generate_model(seed: int) -> void:
	_cancel_startup_prefill_animation()
	var params := _difficulty_params(current_difficulty)
	var gen := LevelGenerator.new()
	model = gen.generate(
		current_size,
		current_size,
		current_depth,
		params.density,
		seed,
		params.min_nonzero_ratio,
		params.min_constraint_ratio,
		params.max_attempts
	)
	model.placed_edges.clear()
	grid_view.model = model
	undo_stack.clear()
	redo_stack.clear()
	undo_pending = {}
	undo_waiting = false
	undo_delayed_action = {}
	hint_pending = {}
	hint_waiting = false
	hint_token += 1
	_compute_total_required_edges()
	_update_status_label()

func _build_startup_prefill_edges(unsolved_circles: int) -> Array:
	var out: Array = []
	if model == null:
		return out
	var target_edges: Dictionary = {}
	for key in model.solution_edges.keys():
		target_edges[key] = true
	if target_edges.is_empty():
		return out
	var candidates: Array = []
	for node_id in range(model.total_nodes()):
		if not model.is_active(node_id):
			continue
		if model.required[node_id] <= 0:
			continue
		candidates.append(node_id)
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	if not candidates.is_empty():
		_shuffle_array(candidates, rng)
	var target_unsolved := mini(maxi(unsolved_circles, 0), candidates.size())
	var removed_any := false
	for i in range(target_unsolved):
		if _remove_random_solution_edge_for_node_from_set(int(candidates[i]), target_edges, rng):
			removed_any = true
	# Safety: never start fully solved.
	if not removed_any and not target_edges.is_empty():
		var target_keys := target_edges.keys()
		var pick := rng.randi_range(0, target_keys.size() - 1)
		target_edges.erase(target_keys[pick])
	out = target_edges.keys()
	_shuffle_array(out, rng)
	return out

func _remove_random_solution_edge_for_node_from_set(node_id: int, target_edges: Dictionary, rng: RandomNumberGenerator) -> bool:
	var edge_keys: Array = []
	for nb in model.neighbors(node_id):
		var key := model.edge_key(node_id, nb)
		if not model.solution_edges.has(key):
			continue
		if not target_edges.has(key):
			continue
		edge_keys.append(key)
	if edge_keys.is_empty():
		return false
	var idx := rng.randi_range(0, edge_keys.size() - 1)
	target_edges.erase(edge_keys[idx])
	return true

func _start_startup_prefill_animation(edge_keys: Array) -> void:
	if model == null:
		return
	if edge_keys.is_empty():
		startup_fill_in_progress = false
		_update_status_label()
		return
	startup_fill_token += 1
	var token := startup_fill_token
	startup_fill_in_progress = true
	_run_startup_prefill_animation(token, edge_keys)

func _run_startup_prefill_animation(token: int, edge_keys: Array) -> void:
	for key in edge_keys:
		if token != startup_fill_token:
			return
		if model.placed_edges.has(key):
			continue
		model.placed_edges[key] = true
		var pair := model.decode_edge(int(key))
		_record_action(pair.x, pair.y, true)
		_emit_edge_vfx(pair.x, pair.y, true)
		grid_view.queue_redraw()
		_update_status_label()
		await get_tree().create_timer(STARTUP_CONNECTION_ANIM_DELAY).timeout
	if token != startup_fill_token:
		return
	startup_fill_in_progress = false
	grid_view.queue_redraw()
	_update_status_label()

func _cancel_startup_prefill_animation() -> void:
	startup_fill_token += 1
	startup_fill_in_progress = false

func _shuffle_array(arr: Array, rng: RandomNumberGenerator) -> void:
	for i in range(arr.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var tmp = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp

func _compute_total_required_edges() -> void:
	total_required_edges = 0
	if model == null:
		return
	var sum_required := 0
	for i in range(model.total_nodes()):
		if not model.is_active(i):
			continue
		sum_required += model.required[i]
	total_required_edges = max(1, int(sum_required / 2))

func _is_level_complete() -> bool:
	if model == null:
		return false
	if not model.is_solved():
		return false
	return model.is_required_network_connected()

func _update_status_label() -> void:
	if not is_instance_valid(side_label):
		return
	if model == null:
		side_label.visible = false
		return
	side_label.visible = true
	var placed := model.placed_edges.size()
	var required_edges := total_required_edges
	var connected_nodes := model.connected_required_count()
	var required_nodes := model.required_node_count()
	var dead_end := _has_dead_end_state()
	var split_network := model.is_solved() and connected_nodes < required_nodes
	side_label.text = "Edges %d/%d  Net %d/%d" % [placed, required_edges, connected_nodes, required_nodes]
	if dead_end:
		side_label.text += "  Dead-end"
		side_label.add_theme_color_override("font_color", Color("#FF7C5E"))
	elif split_network:
		side_label.text += "  Merge groups"
		side_label.add_theme_color_override("font_color", Color("#E0F797"))
	elif connected_nodes == required_nodes and required_nodes > 0:
		side_label.add_theme_color_override("font_color", _theme_accent_color())
	else:
		side_label.add_theme_color_override("font_color", _theme_dark_text_color())

func _has_dead_end_state() -> bool:
	if model == null:
		return false
	for node_id in range(model.total_nodes()):
		if not model.is_active(node_id):
			continue
		if model.required[node_id] <= 0:
			continue
		var remaining := model.remaining_dots(node_id)
		if remaining <= 0:
			continue
		var free_neighbors := 0
		for nb in model.neighbors(node_id):
			if model.placed_edge_exists(node_id, nb):
				continue
			if model.remaining_dots(nb) <= 0:
				continue
			free_neighbors += 1
		if free_neighbors < remaining:
			return true
	return false

func _difficulty_params(difficulty: int) -> Dictionary:
	match difficulty:
		DIFFICULTY_EASY:
			return {"density": 0.32, "min_nonzero_ratio": 0.40, "min_constraint_ratio": 0.18, "max_attempts": 18}
		DIFFICULTY_HARD:
			return {"density": 0.52, "min_nonzero_ratio": 0.62, "min_constraint_ratio": 0.36, "max_attempts": 34}
		_:
			return {"density": 0.42, "min_nonzero_ratio": 0.52, "min_constraint_ratio": 0.27, "max_attempts": 26}

func _input(event: InputEvent) -> void:
	if startup_fill_in_progress:
		return
	last_event_time = float(Time.get_ticks_msec()) / 1000.0
	if event is InputEventPanGesture:
		_log_debug("pan gesture delta=%s" % [str(event.delta)])
		_handle_pan_gesture(event.delta)
		return
	if event is InputEventMouseButton and event.pressed:
		if _handle_wheel(event):
			return
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			_maybe_close_vfx_popup(event.position)
		_log_pointer("mouse_down", event.position)
		_release_ui_focus()
		if event.button_index == MOUSE_BUTTON_LEFT:
			if _try_start_connection_drag(event.position):
				_log_debug("connect drag start")
				return
			if _begin_swipe(event.position):
				_log_debug("swipe start")
	if event is InputEventScreenTouch and event.pressed:
		_maybe_close_vfx_popup(event.position)
		_log_pointer("touch_down", event.position)
		_release_ui_focus()
		if _try_start_connection_drag(event.position):
			_log_debug("connect drag start")
			return
		if _begin_swipe(event.position):
			_log_debug("touch swipe start")
	if event is InputEventMouseButton and not event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if connect_drag_active:
			_end_connection_drag(event.position, event.shift_pressed)
			return
		_handle_pointer_release(event.position, event.shift_pressed)
	if event is InputEventScreenTouch and not event.pressed:
		if connect_drag_active:
			_end_connection_drag(event.position, false)
			return
		_handle_pointer_release(event.position, false)
	if event is InputEventMouseMotion and swipe_active:
		last_motion_time = last_event_time
		_handle_drag_event(event.position, event.relative, false)
	if event is InputEventMouseMotion and connect_drag_active:
		last_motion_time = last_event_time
		_handle_connect_drag(event.position)
	if event is InputEventScreenDrag and swipe_active:
		last_motion_time = last_event_time
		_handle_drag_event(event.position, event.relative, true)
	if event is InputEventScreenDrag and connect_drag_active:
		last_motion_time = last_event_time
		_handle_connect_drag(event.position)
	if event is InputEventKey and event.pressed:
		_log_debug("key pressed keycode=%d unicode=%d echo=%s" % [event.keycode, event.unicode, str(event.echo)])
		if not event.echo and event.keycode == KEY_Z and (event.ctrl_pressed or event.meta_pressed):
			if event.shift_pressed:
				_attempt_redo()
			else:
				_attempt_undo()
			return
		if event.keycode == KEY_LEFT:
			_rotate_by_delta(Vector2(-1, 0))
		elif event.keycode == KEY_RIGHT:
			_rotate_by_delta(Vector2(1, 0))
		elif event.keycode == KEY_UP:
			_rotate_by_delta(Vector2(0, -1))
		elif event.keycode == KEY_DOWN:
			_rotate_by_delta(Vector2(0, 1))
		elif event.keycode == KEY_A:
			_rotate_by_delta(Vector2(-1, 0))
		elif event.keycode == KEY_D:
			_rotate_by_delta(Vector2(1, 0))
		elif event.keycode == KEY_W:
			_rotate_by_delta(Vector2(0, -1))
		elif event.keycode == KEY_S:
			_rotate_by_delta(Vector2(0, 1))
		elif event.keycode == KEY_BRACKETLEFT:
			_rotate_by_delta(Vector2(-1, 0))
		elif event.keycode == KEY_BRACKETRIGHT:
			_rotate_by_delta(Vector2(1, 0))
func _handle_pointer_release(pos: Vector2, force_node_auto_fill: bool = false) -> void:
	if not swipe_active:
		return
	if _is_pointer_over_ui(pos):
		swipe_active = false
		return
	if grid_view.is_rotating():
		swipe_active = false
		return
	swipe_active = false
	var threshold := _drag_threshold()
	if drag_moved or swipe_total.length() >= threshold:
		_log_debug("swipe release -> snap")
		if current_depth > 1:
			grid_view.snap_to_nearest()
	else:
		_log_debug("tap release")
		_handle_press(swipe_start, force_node_auto_fill)

func _handle_drag_motion(pos: Vector2) -> void:
	var delta := -(pos - swipe_last)
	_handle_drag_delta(delta, pos)

func _handle_drag_event(pos: Vector2, relative: Vector2, is_touch: bool) -> void:
	var delta := relative
	var scale := 1.0
	var dir := -1.0
	if is_touch:
		scale = 0.6
		dir = 1.0
	delta *= scale * dir
	if delta.length() < 0.001:
		delta = pos - swipe_last
		delta *= scale * dir
	_handle_drag_delta(delta, pos)

func _handle_drag_delta(delta: Vector2, pos: Vector2) -> void:
	swipe_last = pos
	swipe_total += delta
	if current_depth <= 1:
		return
	if grid_view.is_rotating():
		return
	var threshold := _drag_threshold()
	if not drag_moved and swipe_total.length() >= threshold:
		drag_moved = true
		_log_debug("drag threshold reached")
	if drag_moved:
		grid_view.apply_drag(delta, _drag_sensitivity())

func _handle_pan_gesture(delta: Vector2) -> void:
	if current_depth <= 1:
		return
	if grid_view.is_rotating():
		return
	var now := float(Time.get_ticks_msec()) / 1000.0
	if now < pan_block_until:
		return
	if swipe_active:
		return
	pan_active = true
	pan_end_deadline = now + 0.18
	if now - pan_last_time > 0.15:
		pan_accum = Vector2.ZERO
	pan_last_time = now
	pan_accum += delta
	var threshold := maxf(8.0, _drag_threshold() * 0.6)
	if pan_accum.length() >= threshold:
		_log_debug("pan threshold reached accum=%s" % [str(pan_accum)])
		var dir := Vector2(pan_accum.x, pan_accum.y)
		if absf(dir.x) >= absf(dir.y):
			dir = Vector2(sign(dir.x), 0)
		else:
			dir = Vector2(0, sign(dir.y))
		pan_accum = Vector2.ZERO
		_rotate_by_delta(dir)
		pan_block_until = now + 1.0
		pan_active = false

func _process(delta: float) -> void:
	if pan_active and float(Time.get_ticks_msec()) / 1000.0 > pan_end_deadline:
		pan_active = false
		pan_accum = Vector2.ZERO
	post_fx_time += delta
	if is_instance_valid(post_fx_material) and _any_post_fx_enabled():
		post_fx_material.set_shader_parameter("time_offset", post_fx_time)
		post_fx_material.set_shader_parameter("intensity", clampf(grid_view.get_vfx_intensity(), 0.0, POST_FX_INTENSITY_MAX))
		post_fx_material.set_shader_parameter("motion", clampf(grid_view.get_vfx_motion(), 0.0, POST_FX_MOTION_MAX))
	if use_polling_input:
		_poll_keyboard_web()
		_poll_pointer_web()

func _rotate_by_delta(dir: Vector2) -> void:
	if current_depth <= 1:
		return
	if grid_view.is_rotating():
		return
	var swipe_dir := dir.normalized()
	if swipe_dir == Vector2.ZERO:
		return
	grid_view.rotate_step(swipe_dir)

func _drag_threshold() -> float:
	var vp := get_viewport_rect().size
	return maxf(12.0, minf(vp.x, vp.y) * 0.02)

func _drag_sensitivity() -> float:
	var vp := get_viewport_rect().size
	return PI / maxf(240.0, minf(vp.x, vp.y))

func _begin_swipe(pos: Vector2) -> bool:
	if swipe_active:
		return false
	if _is_pointer_over_ui(pos):
		return false
	if connect_drag_active:
		return false
	swipe_active = true
	swipe_start = pos
	swipe_last = pos
	swipe_total = Vector2.ZERO
	drag_moved = false
	return true

func _handle_wheel(event: InputEventMouseButton) -> bool:
	var dir := Vector2.ZERO
	match event.button_index:
		MOUSE_BUTTON_WHEEL_LEFT:
			dir = Vector2(-1, 0)
		MOUSE_BUTTON_WHEEL_RIGHT:
			dir = Vector2(1, 0)
		MOUSE_BUTTON_WHEEL_UP:
			dir = Vector2(0, -1)
		MOUSE_BUTTON_WHEEL_DOWN:
			dir = Vector2(0, 1)
	if dir == Vector2.ZERO:
		return false
	var now := float(Time.get_ticks_msec()) / 1000.0
	if now < pan_block_until:
		return true
	_rotate_by_delta(dir)
	pan_block_until = now + 0.6
	return true

func _poll_keyboard_web() -> void:
	if _key_just_pressed(KEY_Z) and _is_primary_modifier_pressed():
		if _is_shift_held():
			_attempt_redo()
		else:
			_attempt_undo()
		return
	if current_depth <= 1 or grid_view.is_rotating():
		return
	var dir := Vector2.ZERO
	if _key_just_pressed(KEY_LEFT) or _key_just_pressed(KEY_A) or _key_just_pressed(KEY_BRACKETLEFT):
		dir = Vector2(-1, 0)
	elif _key_just_pressed(KEY_RIGHT) or _key_just_pressed(KEY_D) or _key_just_pressed(KEY_BRACKETRIGHT):
		dir = Vector2(1, 0)
	elif _key_just_pressed(KEY_UP) or _key_just_pressed(KEY_W):
		dir = Vector2(0, -1)
	elif _key_just_pressed(KEY_DOWN) or _key_just_pressed(KEY_S):
		dir = Vector2(0, 1)
	if dir != Vector2.ZERO:
		_rotate_by_delta(dir)

func _key_just_pressed(keycode: int) -> bool:
	var pressed := Input.is_key_pressed(keycode)
	var prev := false
	if key_state.has(keycode):
		prev = key_state[keycode]
	key_state[keycode] = pressed
	return pressed and not prev

func _is_primary_modifier_pressed() -> bool:
	return Input.is_key_pressed(KEY_CTRL) or Input.is_key_pressed(KEY_META)

func _is_shift_held() -> bool:
	return Input.is_key_pressed(KEY_SHIFT)

func _poll_pointer_web() -> void:
	var now := float(Time.get_ticks_msec()) / 1000.0
	if now - last_motion_time < 0.12:
		return
	var pressed := Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
	var pos := get_viewport().get_mouse_position()
	if pressed:
		if not poll_mouse_active:
			poll_mouse_active = true
			if _try_start_connection_drag(pos):
				return
			_begin_swipe(pos)
			return
		if connect_drag_active:
			_handle_connect_drag(pos)
			return
		if swipe_active:
			_handle_drag_motion(pos)
		poll_mouse_last = pos
	elif poll_mouse_active:
		if connect_drag_active:
			_end_connection_drag(pos, _is_shift_held())
		else:
			_handle_pointer_release(pos, _is_shift_held())
		poll_mouse_active = false

func _try_start_connection_drag(pos: Vector2) -> bool:
	if _is_pointer_over_ui(pos):
		return false
	if grid_view.is_rotating():
		return false
	if model == null:
		return false
	var node_id := grid_view.pick_node(pos)
	if node_id == -1:
		return false
	connect_drag_active = true
	connect_anchor_id = node_id
	connect_last_id = node_id
	connect_moved = false
	connect_start_pos = pos
	return true

func _handle_connect_drag(pos: Vector2) -> void:
	if not connect_drag_active:
		return
	if grid_view.is_rotating():
		return
	_clear_hint()
	var node_id := grid_view.pick_node(pos)
	if node_id == -1:
		return
	if node_id == connect_last_id:
		return
	if not model.is_neighbor(connect_anchor_id, node_id):
		return
	if not connect_moved:
		connect_moved = true
		_clear_selection()
	if model.placed_edge_exists(connect_anchor_id, node_id):
		var before_a := model.remaining_dots(connect_anchor_id)
		var before_b := model.remaining_dots(node_id)
		if model.remove_placed_edge(connect_anchor_id, node_id):
			_record_action(connect_anchor_id, node_id, false)
			_play_edge_sfx(connect_anchor_id, node_id, false)
			_emit_edge_vfx(connect_anchor_id, node_id, false)
			_maybe_play_node_complete(connect_anchor_id, node_id, before_a, before_b)
	else:
		var before_a := model.remaining_dots(connect_anchor_id)
		var before_b := model.remaining_dots(node_id)
		if model.add_placed_edge(connect_anchor_id, node_id):
			_record_action(connect_anchor_id, node_id, true)
			_play_edge_sfx(connect_anchor_id, node_id, true)
			_emit_edge_vfx(connect_anchor_id, node_id, true)
			_maybe_play_node_complete(connect_anchor_id, node_id, before_a, before_b)
	connect_anchor_id = node_id
	connect_last_id = node_id
	grid_view.queue_redraw()
	_update_status_label()
	if _is_level_complete():
		_show_completion()
		connect_drag_active = false

func _end_connection_drag(pos: Vector2, force_node_auto_fill: bool = false) -> void:
	if not connect_drag_active:
		return
	var did_move := connect_moved
	connect_drag_active = false
	connect_anchor_id = -1
	connect_last_id = -1
	if not did_move:
		_handle_press(connect_start_pos, force_node_auto_fill)

func _handle_press(pos: Vector2, force_node_auto_fill: bool = false) -> void:
	_log_pointer("handle_press", pos)
	_clear_hint()
	var node_id: int = grid_view.pick_node(pos)
	if node_id == -1:
		_clear_selection()
		var now := float(Time.get_ticks_msec()) / 1000.0
		if (now - last_empty_tap_time) <= 0.35:
			last_empty_tap_time = 0.0
			_attempt_undo()
			return
		last_empty_tap_time = now
		last_tap_node = -1
		return
	last_empty_tap_time = 0.0
	if force_node_auto_fill:
		last_tap_time = 0.0
		last_tap_node = -1
		_auto_fill_node(node_id)
		return
	var now := float(Time.get_ticks_msec()) / 1000.0
	if node_id == last_tap_node and (now - last_tap_time) <= 0.35:
		last_tap_time = 0.0
		last_tap_node = -1
		_auto_fill_node(node_id)
		return
	last_tap_time = now
	last_tap_node = node_id

	if selected_id == -1:
		selected_id = node_id
		grid_view.selected_id = node_id
		grid_view.queue_redraw()
		return

	if node_id == selected_id:
		_clear_selection()
		return

	if model.is_neighbor(selected_id, node_id):
		if model.placed_edge_exists(selected_id, node_id):
			var before_a := model.remaining_dots(selected_id)
			var before_b := model.remaining_dots(node_id)
			if model.remove_placed_edge(selected_id, node_id):
				_record_action(selected_id, node_id, false)
				_play_edge_sfx(selected_id, node_id, false)
				_emit_edge_vfx(selected_id, node_id, false)
				_maybe_play_node_complete(selected_id, node_id, before_a, before_b)
		else:
			var before_a := model.remaining_dots(selected_id)
			var before_b := model.remaining_dots(node_id)
			if model.add_placed_edge(selected_id, node_id):
				_record_action(selected_id, node_id, true)
				_play_edge_sfx(selected_id, node_id, true)
				_emit_edge_vfx(selected_id, node_id, true)
				_maybe_play_node_complete(selected_id, node_id, before_a, before_b)

	_clear_selection()

	_update_status_label()
	if _is_level_complete():
		_show_completion()

func _auto_fill_node(node_id: int) -> void:
	if model == null:
		return
	if grid_view.is_rotating():
		return
	var remaining := model.remaining_dots(node_id)
	var batch_actions: Array = []
	if remaining <= 0:
		var changed := false
		for nb in model.neighbors(node_id):
			if model.placed_edge_exists(node_id, nb):
				var before_a := model.remaining_dots(node_id)
				var before_b := model.remaining_dots(nb)
				if model.remove_placed_edge(node_id, nb):
					batch_actions.append({"a": node_id, "b": nb, "connected": false})
					_play_edge_sfx(node_id, nb, false)
					_emit_edge_vfx(node_id, nb, false)
					_maybe_play_node_complete(node_id, nb, before_a, before_b)
					changed = true
		_record_actions(batch_actions)
		if changed:
			grid_view.queue_redraw()
			_update_status_label()
		_clear_selection()
		if _is_level_complete():
			_show_completion()
		return
	for nb in model.neighbors(node_id):
		if remaining <= 0:
			break
		if model.remaining_dots(nb) <= 0:
			continue
		if model.placed_edge_exists(node_id, nb):
			continue
		var before_a := model.remaining_dots(node_id)
		var before_b := model.remaining_dots(nb)
		if model.add_placed_edge(node_id, nb):
			batch_actions.append({"a": node_id, "b": nb, "connected": true})
			_play_edge_sfx(node_id, nb, true)
			_emit_edge_vfx(node_id, nb, true)
			_maybe_play_node_complete(node_id, nb, before_a, before_b)
			remaining = model.remaining_dots(node_id)
	_record_actions(batch_actions)
	grid_view.queue_redraw()
	_update_status_label()
	_clear_selection()
	if _is_level_complete():
		_show_completion()

func _clear_selection() -> void:
	selected_id = -1
	grid_view.selected_id = -1
	grid_view.queue_redraw()

func _show_completion() -> void:
	if completion_panel.visible:
		return
	grid_view.trigger_completion_wave()
	_play_completion_tune()
	_haptic_pulse(60, 0.9)
	completion_label.text = "Level Complete"
	completion_panel.visible = true
	var tween := create_tween()
	completion_panel.modulate = Color(1, 1, 1, 0)
	tween.tween_property(completion_panel, "modulate", Color(1, 1, 1, 1), 0.35).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)

func _on_hint_pressed() -> void:
	grid_view.pulse_ui_light(0.78)
	_play_sfx(sfx_ui)
	_show_hint()

func _on_solve_pressed() -> void:
	if not developer_mode:
		return
	grid_view.pulse_ui_light(0.95)
	_play_sfx(sfx_ui)
	if model == null:
		return
	_cancel_startup_prefill_animation()
	completion_panel.visible = false
	undo_stack.clear()
	redo_stack.clear()
	undo_pending = {}
	undo_waiting = false
	undo_delayed_action = {}
	_clear_selection()
	_clear_hint()
	model.placed_edges.clear()
	grid_view.queue_redraw()
	_update_status_label()
	var edge_keys := _build_startup_prefill_edges(START_WITH_UNSOLVED_CIRCLES)
	_start_startup_prefill_animation(edge_keys)

func _show_hint() -> void:
	if model == null:
		return
	if grid_view.is_rotating():
		return
	var hint_nodes := _find_hint_nodes()
	if hint_nodes.is_empty():
		return
	var target_id := int(hint_nodes[0])
	var target_face := grid_view.best_face_for_node(target_id)
	if current_depth > 1 and grid_view.get_front_face() != target_face:
		hint_pending = {"nodes": hint_nodes, "face": target_face}
		hint_waiting = true
		grid_view.rotation_finished.connect(_on_hint_rotation_finished, Object.CONNECT_ONE_SHOT)
		grid_view.snap_to_face(target_face)
		return
	_apply_hint(hint_nodes)

func _find_hint_nodes() -> Array:
	var best_id := -1
	var best_score := -1.0
	for node_id in range(model.total_nodes()):
		if not model.is_active(node_id):
			continue
		var remaining := model.remaining_dots(node_id)
		if remaining <= 0:
			continue
		var free_neighbors := _free_neighbor_count(node_id)
		if free_neighbors <= 0:
			continue
		if remaining != free_neighbors:
			continue
		var score := float(free_neighbors)
		if grid_view.is_node_on_front_face(node_id):
			score += 4.0
		if score > best_score:
			best_score = score
			best_id = node_id
	if best_id != -1:
		return [best_id]
	var best_pair: Array = []
	var best_slack := 9999
	best_score = -1000000.0
	var free_counts := {}
	for node_id in range(model.total_nodes()):
		if not model.is_active(node_id):
			continue
		var remaining := model.remaining_dots(node_id)
		if remaining <= 0:
			continue
		var free_neighbors := _free_neighbor_count(node_id)
		if free_neighbors <= 0:
			continue
		if free_neighbors < remaining:
			continue
		free_counts[node_id] = free_neighbors
	for raw_id in free_counts.keys():
		var node_id := int(raw_id)
		var remaining := model.remaining_dots(node_id)
		var slack := int(free_counts[node_id]) - remaining
		for nb in model.neighbors(node_id):
			if node_id >= nb:
				continue
			if model.placed_edge_exists(node_id, nb):
				continue
			if not free_counts.has(nb):
				continue
			var nb_remaining := model.remaining_dots(nb)
			var nb_slack := int(free_counts[nb]) - nb_remaining
			var pair_slack := slack + nb_slack
			var score := float(remaining + nb_remaining) * 0.25
			if grid_view.is_node_on_front_face(node_id):
				score += 1.5
			if grid_view.is_node_on_front_face(nb):
				score += 1.5
			if pair_slack < best_slack or (pair_slack == best_slack and score > best_score):
				best_slack = pair_slack
				best_score = score
				best_pair = [node_id, nb]
	if best_pair.size() == 2:
		var first := int(best_pair[0])
		var second := int(best_pair[1])
		if grid_view.is_node_on_front_face(second) and not grid_view.is_node_on_front_face(first):
			best_pair = [second, first]
	return best_pair

func _free_neighbor_count(node_id: int) -> int:
	var count := 0
	for nb in model.neighbors(node_id):
		if model.placed_edge_exists(node_id, nb):
			continue
		if model.remaining_dots(nb) <= 0:
			continue
		count += 1
	return count

func _on_hint_rotation_finished() -> void:
	if not hint_waiting:
		return
	hint_waiting = false
	if hint_pending.is_empty():
		return
	var nodes: Array = []
	if hint_pending.has("nodes"):
		nodes = hint_pending["nodes"]
	elif hint_pending.has("id"):
		nodes = [int(hint_pending["id"])]
	hint_pending = {}
	_apply_hint(nodes)

func _apply_hint(nodes: Array) -> void:
	if nodes.is_empty():
		return
	var normalized: Array = []
	for raw_id in nodes:
		var node_id := int(raw_id)
		if node_id < 0:
			continue
		if normalized.has(node_id):
			continue
		normalized.append(node_id)
	if normalized.is_empty():
		return
	_clear_selection()
	grid_view.hint_id = int(normalized[0])
	grid_view.hint_ids = normalized
	grid_view.queue_redraw()
	hint_token += 1
	var token := hint_token
	var timer := get_tree().create_timer(HINT_HOLD_TIME)
	timer.timeout.connect(func ():
		if token != hint_token:
			return
		_clear_hint()
	, Object.CONNECT_ONE_SHOT)

func _clear_hint() -> void:
	if grid_view.hint_id == -1 and grid_view.hint_ids.is_empty():
		return
	grid_view.hint_id = -1
	grid_view.hint_ids = []
	grid_view.queue_redraw()

func _record_action(a: int, b: int, connected: bool) -> void:
	_record_actions([{"a": a, "b": b, "connected": connected}])

func _record_actions(actions: Array) -> void:
	if suppress_record:
		return
	if model == null:
		return
	if actions.is_empty():
		return
	var face := GridView.FACE_FRONT
	if current_depth > 1:
		face = grid_view.get_front_face()
	undo_stack.append({"face": face, "actions": actions})
	redo_stack.clear()

func _attempt_undo() -> void:
	if undo_waiting:
		return
	if undo_stack.is_empty():
		return
	var action: Dictionary = undo_stack.pop_back()
	_start_history_step(action, false)

func _attempt_redo() -> void:
	if undo_waiting:
		return
	if redo_stack.is_empty():
		return
	var action: Dictionary = redo_stack.pop_back()
	_start_history_step(action, true)

func _start_history_step(action: Dictionary, is_redo: bool) -> void:
	if action.is_empty():
		return
	if grid_view.is_rotating():
		undo_pending = {"action": action, "redo": is_redo}
		undo_waiting = true
		grid_view.rotation_finished.connect(_on_undo_rotation_finished, Object.CONNECT_ONE_SHOT)
		return
	var target_face: int = int(action.get("face", GridView.FACE_FRONT))
	if current_depth > 1 and grid_view.get_front_face() != target_face:
		undo_pending = {"action": action, "redo": is_redo}
		undo_waiting = true
		grid_view.rotation_finished.connect(_on_undo_rotation_finished, Object.CONNECT_ONE_SHOT)
		grid_view.snap_to_face(target_face)
		return
	_apply_history_step(action, is_redo)

func _on_undo_rotation_finished() -> void:
	if not undo_waiting:
		return
	undo_waiting = false
	var action_data: Dictionary = undo_pending
	undo_pending = {}
	if action_data.is_empty():
		return
	undo_delayed_action = action_data
	var timer := get_tree().create_timer(UNDO_ROTATE_DELAY)
	timer.timeout.connect(_on_undo_delay_timeout, Object.CONNECT_ONE_SHOT)

func _on_undo_delay_timeout() -> void:
	if undo_delayed_action.is_empty():
		return
	var action_data := undo_delayed_action
	undo_delayed_action = {}
	var action: Dictionary = {}
	if action_data.has("action") and action_data.action is Dictionary:
		action = action_data.action
	var is_redo := bool(action_data.get("redo", false))
	_start_history_step(action, is_redo)

func _apply_history_step(action: Dictionary, is_redo: bool) -> void:
	if model == null:
		return
	suppress_record = true
	var changed := false
	var actions: Array = []
	if action.has("actions") and action.actions is Array:
		actions = action.actions
	if is_redo:
		for i in range(actions.size()):
			var item: Dictionary = actions[i]
			var a: int = int(item.a)
			var b: int = int(item.b)
			var connected: bool = bool(item.connected)
			var before_a := model.remaining_dots(a)
			var before_b := model.remaining_dots(b)
			if connected:
				if model.add_placed_edge(a, b):
					_play_edge_sfx(a, b, true)
					_emit_edge_vfx(a, b, true)
					_maybe_play_node_complete(a, b, before_a, before_b)
					changed = true
			else:
				if model.remove_placed_edge(a, b):
					_play_edge_sfx(a, b, false)
					_emit_edge_vfx(a, b, false)
					_maybe_play_node_complete(a, b, before_a, before_b)
					changed = true
	else:
		for i in range(actions.size() - 1, -1, -1):
			var item: Dictionary = actions[i]
			var a: int = int(item.a)
			var b: int = int(item.b)
			var connected: bool = bool(item.connected)
			var before_a := model.remaining_dots(a)
			var before_b := model.remaining_dots(b)
			if connected:
				if model.remove_placed_edge(a, b):
					_play_edge_sfx(a, b, false)
					_emit_edge_vfx(a, b, false)
					_maybe_play_node_complete(a, b, before_a, before_b)
					changed = true
			else:
				if model.add_placed_edge(a, b):
					_play_edge_sfx(a, b, true)
					_emit_edge_vfx(a, b, true)
					_maybe_play_node_complete(a, b, before_a, before_b)
					changed = true
	suppress_record = false
	if changed:
		if is_redo:
			undo_stack.append(action)
		else:
			redo_stack.append(action)
	else:
		if is_redo:
			redo_stack.append(action)
		else:
			undo_stack.append(action)
	if changed:
		completion_panel.visible = false
		_clear_selection()
		grid_view.queue_redraw()
		_update_status_label()
		if _is_level_complete():
			_show_completion()

func _on_back_pressed() -> void:
	_cancel_startup_prefill_animation()
	_hide_vfx_popup()
	_play_sfx(sfx_ui)
	completion_panel.visible = false
	back_requested.emit()

func _on_restart_pressed() -> void:
	_cancel_startup_prefill_animation()
	_hide_vfx_popup()
	_play_sfx(sfx_ui)
	undo_stack.clear()
	redo_stack.clear()
	undo_pending = {}
	undo_waiting = false
	undo_delayed_action = {}
	_generate_model(-1)
	completion_panel.visible = false
	grid_view.selected_id = -1
	grid_view.queue_redraw()
	_update_status_label()

func _on_next_pressed() -> void:
	_cancel_startup_prefill_animation()
	_hide_vfx_popup()
	_play_sfx(sfx_ui)
	undo_stack.clear()
	redo_stack.clear()
	undo_pending = {}
	undo_waiting = false
	undo_delayed_action = {}
	_generate_model(int(Time.get_ticks_msec()))
	completion_panel.visible = false
	grid_view.selected_id = -1
	grid_view.queue_redraw()
	_update_status_label()

func _face_name(face_id: int) -> String:
	match face_id:
		GridView.FACE_FRONT:
			return "Front"
		GridView.FACE_BACK:
			return "Back"
		GridView.FACE_LEFT:
			return "Left"
		GridView.FACE_RIGHT:
			return "Right"
		GridView.FACE_TOP:
			return "Top"
		GridView.FACE_BOTTOM:
			return "Bottom"
		_:
			return "Side"

func _log_pointer(tag: String, pos: Vector2) -> void:
	var node_id := -1
	if model != null:
		node_id = grid_view.pick_node(pos)
	var focus := get_viewport().gui_get_focus_owner()
	var focus_name := "none"
	if focus != null:
		focus_name = str(focus.get_path())
	var message := "%s pos=(%.1f,%.1f) node=%d selected=%d front=%s focus=%s" % [
		tag, pos.x, pos.y, node_id, selected_id, _face_name(grid_view.get_front_face()), focus_name
	]
	_log_debug(message)

func _is_pointer_over_ui(pos: Vector2) -> bool:
	if _control_hit(back_button, pos):
		return true
	if _control_hit(restart_button, pos):
		return true
	if _control_hit(hint_button, pos):
		return true
	if _control_hit(solve_button, pos):
		return true
	if _control_hit(theme_button, pos):
		return true
	if _control_hit(dev_button, pos):
		return true
	if _control_hit(vfx_button, pos):
		return true
	if _control_hit(next_button, pos):
		return true
	if _control_hit(replay_button, pos):
		return true
	if _control_hit(completion_panel, pos):
		return true
	if _popup_hit(vfx_popup, pos):
		return true
	return false

func _maybe_close_vfx_popup(pos: Vector2) -> void:
	if not is_instance_valid(vfx_popup):
		return
	if not vfx_popup.visible:
		return
	if _popup_hit(vfx_popup, pos):
		return
	if _control_hit(vfx_button, pos):
		return
	if _control_hit(dev_button, pos):
		return
	_hide_vfx_popup()

func _hide_vfx_popup() -> void:
	if is_instance_valid(vfx_popup):
		vfx_popup.hide()

func _control_hit(control: Control, pos: Vector2) -> bool:
	if not is_instance_valid(control):
		return false
	if not control.is_visible_in_tree():
		return false
	return control.get_global_rect().has_point(pos)

func _popup_hit(popup: PopupPanel, pos: Vector2) -> bool:
	if not is_instance_valid(popup):
		return false
	if not popup.visible:
		return false
	return Rect2(popup.position, popup.size).has_point(pos)

func _is_ui_control(node: Control) -> bool:
	var current: Node = node
	while current != null:
		if current == back_button or current == restart_button:
			return true
		if current == hint_button or current == solve_button:
			return true
		if current == next_button or current == replay_button:
			return true
		if current == theme_button or current == vfx_button or current == dev_button:
			return true
		if current == completion_panel or current == vfx_popup:
			return true
		current = current.get_parent()
	return false

func _release_ui_focus() -> void:
	if OS.has_feature("web"):
		get_viewport().gui_release_focus()
		_focus_canvas_web()

func _focus_canvas_web() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval("""
		(function() {
			var c = document.getElementById('canvas');
			if (!c) return;
			if (!c.hasAttribute('tabindex')) c.setAttribute('tabindex', '0');
			c.focus();
		})();
	""")

func _log_debug(message: String) -> void:
	if not ENABLE_INPUT_DEBUG_LOG:
		return
	var file := FileAccess.open(DEBUG_LOG_PATH, FileAccess.READ_WRITE)
	if file == null:
		file = FileAccess.open(DEBUG_LOG_PATH, FileAccess.WRITE)
	if file == null:
		return
	file.seek_end()
	file.store_line(message)

func play_ui_sound() -> void:
	_play_sfx(sfx_ui)

func _play_sfx(player: AudioStreamPlayer, pitch: float = 1.0) -> void:
	if player == null:
		return
	if player.playing:
		player.stop()
	player.pitch_scale = pitch
	player.play()

func _play_edge_sfx(a: int, b: int, connected: bool) -> void:
	var progress := 0.0
	if model != null and total_required_edges > 0:
		progress = clampf(float(model.placed_edges.size()) / float(total_required_edges), 0.0, 1.0)
	var pitch := lerpf(0.9, 1.35, progress)
	if connected:
		_play_sfx(sfx_connect, pitch)
		_haptic_pulse(24, 0.45)
	else:
		_play_sfx(sfx_disconnect, maxf(0.8, pitch - 0.1))
		_haptic_pulse(16, 0.35)

func _maybe_play_node_complete(a: int, b: int, before_a: int, before_b: int) -> void:
	if model == null:
		return
	if before_a > 0 and model.remaining_dots(a) == 0:
		_haptic_pulse(40, 0.7)
	elif before_b > 0 and model.remaining_dots(b) == 0:
		_haptic_pulse(40, 0.7)

func _play_completion_tune() -> void:
	if sfx_complete == null:
		return
	var pitches := [1.0, 1.2, 1.45]
	var tween := create_tween()
	tween.tween_callback(Callable(self, "_play_sfx").bind(sfx_complete, pitches[0]))
	for i in range(1, pitches.size()):
		tween.tween_interval(0.12)
		tween.tween_callback(Callable(self, "_play_sfx").bind(sfx_complete, pitches[i]))

func _haptic_pulse(duration_ms: int, amplitude: float = 0.5) -> void:
	if duration_ms <= 0:
		return
	if OS.has_feature("mobile") or OS.has_feature("web"):
		Input.vibrate_handheld(duration_ms, amplitude)
