shader_type canvas_item;
render_mode unshaded, blend_mix;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap, repeat_disable;
uniform int theme = 0;
uniform float time_offset = 0.0;
uniform float intensity : hint_range(0.0, 8.0) = 1.0;
uniform float motion : hint_range(0.0, 8.0) = 1.0;
uniform float effect_mix : hint_range(0.0, 1.0) = 1.0;

uniform float fx_vignette : hint_range(0.0, 8.0) = 1.0;
uniform float fx_bloom_lift : hint_range(0.0, 8.0) = 1.0;
uniform float fx_grain : hint_range(0.0, 8.0) = 1.0;
uniform float fx_chromatic : hint_range(0.0, 8.0) = 1.0;
uniform float fx_scanlines : hint_range(0.0, 8.0) = 1.0;
uniform float fx_lens_warp : hint_range(0.0, 8.0) = 1.0;
uniform float fx_color_grade : hint_range(0.0, 8.0) = 1.0;

uniform float fx_vignette_motion : hint_range(0.0, 8.0) = 1.0;
uniform float fx_bloom_lift_motion : hint_range(0.0, 8.0) = 1.0;
uniform float fx_grain_motion : hint_range(0.0, 8.0) = 1.0;
uniform float fx_chromatic_motion : hint_range(0.0, 8.0) = 1.0;
uniform float fx_scanlines_motion : hint_range(0.0, 8.0) = 1.0;
uniform float fx_lens_warp_motion : hint_range(0.0, 8.0) = 1.0;
uniform float fx_color_grade_motion : hint_range(0.0, 8.0) = 1.0;

float hash12(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 apply_theme_grade(vec3 col, int t, float amount) {
	vec3 out_col = col;
	if (t == 1) {
		out_col *= vec3(1.05, 0.99, 0.94);
		out_col = mix(out_col, vec3(dot(out_col, vec3(0.299, 0.587, 0.114))), 0.03);
	} else if (t == 2) {
		out_col *= vec3(0.92, 1.08, 0.95);
		float glow = smoothstep(0.35, 0.95, out_col.g);
		out_col += vec3(0.02, 0.13, 0.05) * glow * 0.35;
	} else {
		out_col *= vec3(0.97, 0.99, 1.03);
	}
	out_col = pow(max(out_col, vec3(0.0)), vec3(0.98));
	return mix(col, out_col, amount);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	float t = TIME + time_offset;
	float fx_i = clamp(intensity, 0.0, 8.0);
	float fx_m = clamp(motion, 0.0, 8.0);
	vec2 center = uv - vec2(0.5);
	float radial = dot(center, center);
	float m_vignette = clamp(fx_vignette_motion, 0.0, 8.0);
	float m_bloom = clamp(fx_bloom_lift_motion, 0.0, 8.0);
	float m_grain = clamp(fx_grain_motion, 0.0, 8.0);
	float m_chromatic = clamp(fx_chromatic_motion, 0.0, 8.0);
	float m_scan = clamp(fx_scanlines_motion, 0.0, 8.0);
	float m_warp = clamp(fx_lens_warp_motion, 0.0, 8.0);
	float m_grade = clamp(fx_color_grade_motion, 0.0, 8.0);
	bool vignette_on = fx_vignette > 0.001;
	bool bloom_on = fx_bloom_lift > 0.001;
	bool grain_on = fx_grain > 0.001;
	bool chromatic_on = fx_chromatic > 0.001;
	bool scan_on = fx_scanlines > 0.001;
	bool lens_on = fx_lens_warp > 0.001;
	bool grade_on = fx_color_grade > 0.001;

	vec3 src = texture(screen_tex, uv).rgb;
	bool bypass = effect_mix <= 0.001 || (!vignette_on && !bloom_on && !grain_on && !chromatic_on && !scan_on && !lens_on && !grade_on);
	if (bypass) {
		COLOR = vec4(src, 1.0);
	} else {
		vec2 warped_uv = uv;
		if (lens_on) {
			float barrel = radial * (0.02 + 0.012 * fx_i);
			float shimmer = sin((uv.y * 56.0) + t * (1.1 + fx_m * 1.8 * (0.4 + m_warp * 0.6))) * 0.0012;
			warped_uv += center * barrel * fx_lens_warp * 0.34;
			warped_uv.x += shimmer * fx_lens_warp;
		}
		warped_uv = clamp(warped_uv, vec2(0.0), vec2(1.0));

		vec3 col = src;
		if (lens_on || bloom_on || chromatic_on) {
			col = texture(screen_tex, warped_uv).rgb;
		}

		if (bloom_on) {
			vec3 bloom = textureLod(screen_tex, warped_uv, 2.0).rgb;
			float breathe = 0.92 + 0.08 * sin(t * (0.8 + m_bloom));
			col += bloom * (0.08 + 0.14 * fx_i) * fx_bloom_lift * breathe;
		}

		if (chromatic_on) {
			float ca_osc = 0.9 + 0.1 * sin(t * (1.1 + m_chromatic * 1.4) + radial * 18.0);
			vec2 ca = center * (0.001 + 0.0026 * fx_i) * fx_chromatic * ca_osc;
			float r = texture(screen_tex, clamp(warped_uv + ca, vec2(0.0), vec2(1.0))).r;
			float g = texture(screen_tex, warped_uv).g;
			float b = texture(screen_tex, clamp(warped_uv - ca, vec2(0.0), vec2(1.0))).b;
			col = mix(col, vec3(r, g, b), 0.75 * fx_chromatic);
		}

		if (scan_on) {
			float freq = (theme == 2) ? 980.0 : 540.0;
			float wave = 0.5 + 0.5 * sin((uv.y + t * (0.02 + fx_m * 0.03 * (0.35 + 0.65 * m_scan))) * freq);
			float amount = ((theme == 2) ? 0.09 : 0.04) * (0.6 + 0.5 * fx_i) * fx_scanlines;
			col *= 1.0 - wave * amount;
		}

		if (grain_on) {
			float grain = hash12(uv * vec2(1280.0, 720.0) + vec2(t * 42.0 * (0.4 + fx_m * (0.25 + 0.75 * m_grain)), -t * 31.0 * (0.4 + fx_m * (0.25 + 0.75 * m_grain)))) - 0.5;
			float grain_strength = ((theme == 1) ? 0.02 : 0.03) * (0.65 + 0.55 * fx_i) * fx_grain;
			col += vec3(grain) * grain_strength;
		}

		if (grade_on) {
			float grade_osc = 0.95 + 0.05 * sin(t * (0.7 + m_grade * 0.8));
			col = apply_theme_grade(col, theme, 0.58 * fx_color_grade * grade_osc);
		}

		if (vignette_on) {
			float vig_osc = 1.0 + 0.02 * sin(t * (0.45 + m_vignette * 0.55));
			float vig = smoothstep(0.22, 0.82, sqrt(radial) * 1.28 * vig_osc);
			float darken = (0.17 + 0.18 * fx_i) * fx_vignette;
			vec3 tint = vec3(0.88, 0.92, 1.0);
			if (theme == 1) {
				tint = vec3(1.0, 0.86, 0.72);
			} else if (theme == 2) {
				tint = vec3(0.72, 1.0, 0.82);
			}
			col *= 1.0 - vig * darken;
			col += tint * vig * 0.018 * fx_vignette;
		}

		col = clamp(col, 0.0, 1.0);
		COLOR = vec4(mix(src, col, clamp(effect_mix, 0.0, 1.0)), 1.0);
	}
}
