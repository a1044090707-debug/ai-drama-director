# 奶油绿片场素材

使用内置 image_gen 生成，以用户选定的 `design-demos/02-cream-green.png` 为风格参考。

- `animal-busts.png` 1254 × 1254，透明 2 × 2 半身角色图集。
- `animal-heads.png` 1254 × 1254，透明 2 × 2 头像图集。
- 两者按左上狐狸、右上兔子、左下小熊、右下青蛙排列。
- 角色图集用于舞台示意和角色卡。头像图集用于角色选择和摄像头卡通遮脸。
- 页面里的标题、字幕、按钮、滑块、角色卡、人数与记录均为实际 HTML 或 Canvas 绘制。

## 半身角色生成提示词

Use case: stylized-concept. Production sprite asset for the attached selected cream-and-sage-green “AI 戏精导演” interface. Use attached image as CHARACTER STYLE REFERENCE, not as a target to preserve. Generate ONE perfectly square transparent PNG, a precise 2 by 2 sprite atlas of FOUR separate premium 3D anthropomorphic animal WAIST-UP busts. Each character entirely contained in its equal square quadrant; no crossing the exact central grid boundaries. No grid lines or frames. Transparent background and transparent margins; no scenery, shadows outside body, floor, labels, letters, UI, watermarks.
TOP LEFT: adorable orange FOX in sage-green cotton hoodie, curiously looking slightly to the right, paws relaxed, fluffy white cheeks, expressive brown eyes.
TOP RIGHT: adorable white RABBIT in orange-and-cream varsity jacket, one paw lightly resting at the temple as a facepalm, expressive eyes, long soft pink-lined ears fully inside quadrant.
BOTTOM LEFT: adorable brown BEAR in cream sherpa-fleece zip jacket with olive trim, delighted surprised expression, both paws beside the head, full ears visible.
BOTTOM RIGHT: adorable friendly green FROG in pale sage hoodie, large appealing eyes and gentle smiling mouth, one open paw waving.
All rendered with the same high-end animated film 3D quality as reference: round lovable proportions, beautiful dimensional facial modeling, very soft warm studio lighting, fine fur, detailed hoodie fabric and cream fleece. No flat vectors, no emoji. The animals fill roughly 90 percent of their quadrant height and 90 percent of width, with safely transparent margins. Identical waist-up scale. Head centered horizontally, garment cropped flat along bottom inside its quadrant, torso visible. Natural expressive anatomy and five-finger paws where appropriate. Keep the reference palette warm cream, muted sage, bright orange. This asset will be split by code into exactly four equal square cells.

## 头像生成提示词

Use case: stylized-concept. Create a production-ready transparent 3D HEAD sprite atlas for the selected attached cream-and-sage animal party-game interface. The attachment is a style and animal character reference only. ONE perfectly square image, precise 2-by-2 equal square cells, no visible dividing lines. Completely transparent background, clean smooth cutout edges, no checkerboard, labels, shadows outside the heads, collars, clothing, paws, body, UI, watermark.
TOP LEFT cell: warm orange fox head with fluffy white cheeks and white muzzle, large glossy friendly brown eyes, upright ears.
TOP RIGHT cell: white rabbit head, tall ears with pink lining, cute rounded muzzle, friendly open expressive eyes.
BOTTOM LEFT cell: warm brown bear head, small round ears, cream muzzle, charming friendly eyes and smile.
BOTTOM RIGHT cell: bright muted-green frog head, large raised eyes and pale cream chin, friendly smile.
All face straight toward the viewer, same eye level, same scale, luxurious round dimensional animated-film rendering, soft warm studio light and extremely refined fine fur where appropriate. Consistent with reference animal faces. Not emoji, not flat drawing. Heads completely isolated, each entirely inside its quadrant with safe margins and NO overlap across grid boundaries.
Technical alignment IMPORTANT: in each square cell, face center x=50%, y=62%; eyes roughly y=53%; chin bottom roughly y=86%; face cheeks span x=17% to83%. Fox/rabbit ear tips may reach y=6%; bear and frog tops around y=24%. Keep face width and eye level consistent so a programmer can draw the same aligned head rectangle from any of the four cells. Heads ONLY, plain transparent cutouts.

