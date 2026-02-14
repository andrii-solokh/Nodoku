shader_type canvas_item;
render_mode unshaded;

uniform int theme = 0;
uniform float speed = 1.0;
uniform float time_offset = 0.0;
uniform float glow_strength = 1.0;
uniform float scan_strength : hint_range(0.0, 1.0) = 0.12;
uniform float grid_strength : hint_range(0.0, 1.0) = 0.1;
uniform float grain_strength : hint_range(0.0, 1.0) = 0.08;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 3; i++) {
		v += amp * noise(p);
		p = p * 2.03 + vec2(17.13, 9.37);
		amp *= 0.5;
	}
	return v;
}

void get_palette(int t, out vec3 bg_a, out vec3 bg_b, out vec3 accent) {
	if (t == 1) {
		bg_a = vec3(0.02, 0.04, 0.08);
		bg_b = vec3(0.08, 0.13, 0.21);
		accent = vec3(0.95, 0.68, 0.37);
	} else if (t == 2) {
		bg_a = vec3(0.0, 0.05, 0.02);
		bg_b = vec3(0.0, 0.12, 0.06);
		accent = vec3(0.45, 1.0, 0.62);
	} else {
		bg_a = vec3(0.93, 0.91, 0.88);
		bg_b = vec3(0.84, 0.87, 0.9);
		accent = vec3(0.57, 0.63, 0.67);
	}
}

void fragment() {
	vec2 uv = UV;
	float t = (TIME + time_offset) * speed;

	vec3 bg_a;
	vec3 bg_b;
	vec3 accent;
	get_palette(theme, bg_a, bg_b, accent);

	// Domain-warped soft flow for smoother, less noisy motion.
	vec2 warp = vec2(
		fbm(uv * vec2(2.0, 2.7) + vec2(t * 0.05, -t * 0.03)),
		fbm(uv * vec2(2.4, 2.1) + vec2(-t * 0.04, t * 0.05))
	) - 0.5;
	vec2 flow_uv = uv * vec2(2.1, 2.8) + warp * 0.22 + vec2(t * 0.025, -t * 0.018);
	float flow = fbm(flow_uv);
	float cloud = fbm(flow_uv * 1.7 + vec2(0.0, t * 0.06));
	float mix_t = clamp(uv.y * 0.9 + flow * 0.22, 0.0, 1.0);

	vec3 col = mix(bg_a, bg_b, mix_t);
	float pulse = 0.5 + 0.5 * sin(t * 0.62 + uv.x * 4.2 - uv.y * 3.4);
	col += accent * (0.045 + 0.18 * cloud * pulse) * glow_strength;

	if (theme == 2) {
		// Softer terminal treatment: scan/phosphor feel without harsh stripes.
		float scan = 0.5 + 0.5 * sin((uv.y + t * 0.32) * 820.0);
		col *= 1.0 - scan_strength * scan * 0.75;

		float fx = fract(uv.x * 11.0 + t * 0.01);
		float fy = fract(uv.y * 8.0);
		float gx = 1.0 - smoothstep(0.0, 0.02, min(fx, 1.0 - fx));
		float gy = 1.0 - smoothstep(0.0, 0.018, min(fy, 1.0 - fy));
		col += accent * (gx + gy) * grid_strength * 0.12;

		float flicker = 0.985 + 0.015 * sin(t * 5.2 + uv.y * 20.0);
		col *= flicker;
	} else if (theme == 1) {
		// Warm: elegant drifting glow pockets + soft ember specks.
		vec2 c1 = vec2(0.34 + 0.09 * sin(t * 0.18), 0.52 + 0.06 * cos(t * 0.16));
		vec2 c2 = vec2(0.68 + 0.08 * cos(t * 0.14), 0.36 + 0.07 * sin(t * 0.2));
		float g1 = exp(-pow(length(uv - c1) * 2.7, 2.0));
		float g2 = exp(-pow(length(uv - c2) * 3.0, 2.0));
		col += vec3(1.0, 0.62, 0.34) * (g1 * 0.17 + g2 * 0.14) * glow_strength;

		vec2 ember_uv = (uv + vec2(0.0, t * 0.08)) * vec2(56.0, 34.0);
		vec2 ember_cell = floor(ember_uv);
		vec2 ember_f = fract(ember_uv) - 0.5;
		float ember_id = hash(ember_cell);
		float ember_spawn = smoothstep(0.988, 1.0, ember_id);
		float ember_shape = exp(-dot(ember_f, ember_f) * 26.0);
		col += vec3(1.0, 0.58, 0.3) * ember_spawn * ember_shape * 0.18;
	} else {
		// Classic: subtle paper grain + slow diagonal sheen.
		float grain = hash(uv * vec2(860.0, 520.0) + vec2(t * 11.0, -t * 7.0)) - 0.5;
		col += vec3(grain) * grain_strength * 0.08;
		float sheen = smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(t * 0.26 + uv.x * 5.4 + uv.y * 2.1));
		col += accent * sheen * 0.022 * glow_strength;
	}

	vec2 dv = (uv - 0.5) * vec2(1.22, 1.0);
	float edge = smoothstep(0.35, 0.78, length(dv));
	col *= 1.0 - edge * 0.3;

	COLOR = vec4(clamp(col, 0.0, 1.0), 1.0);
}
