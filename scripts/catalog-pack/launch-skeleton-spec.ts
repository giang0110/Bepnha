/**
 * The structural half of a launch catalog: which foods exist, which dishes they make, and which
 * meals those dishes compose into. Nothing here is a measurement.
 *
 * Every figure a person must look up — nutrition per 100g, allergen conclusions, prices, edible
 * fractions, unit conversions, quantities, times — is deliberately absent, and the generator writes
 * a `CAN-DIEN` marker or an empty cell in its place. `AGENTS.md` section 3 forbids an LLM authoring
 * those, and the reason is concrete: a guessed `peanut: absent` can put an allergic child in
 * hospital, and a guessed price makes every budget the app shows a lie.
 *
 * Dish composition is an editorial proposal to review, not data. Read it before filling anything in.
 */

export type Dimension = "mass" | "volume" | "count"

export interface FoodSpec {
  readonly code: string
  readonly nameVi: string
  readonly categoryCode: string
  readonly ancestry: readonly string[]
  readonly baseUnitCode: string
  readonly baseDimension: Dimension
}

const mass = (
  code: string,
  nameVi: string,
  categoryCode: string,
  ancestry: readonly string[]
): FoodSpec => ({ code, nameVi, categoryCode, ancestry, baseUnitCode: "g", baseDimension: "mass" })

const volume = (code: string, nameVi: string): FoodSpec => ({
  code,
  nameVi,
  categoryCode: "seasoning",
  ancestry: ["seasoning", "food"],
  baseUnitCode: "ml",
  baseDimension: "volume"
})

const seasoning = (code: string, nameVi: string): FoodSpec =>
  mass(code, nameVi, "seasoning", ["seasoning", "food"])

const vegetable = (code: string, nameVi: string): FoodSpec =>
  mass(code, nameVi, "vegetable", ["vegetable", "food"])

export const FOODS: readonly FoodSpec[] = [
  mass("ga_ta", "Thịt gà ta", "poultry", ["poultry", "food"]),
  mass("thit_ba_chi", "Thịt ba chỉ", "pork", ["pork", "food"]),
  mass("thit_nac_vai", "Thịt nạc vai heo", "pork", ["pork", "food"]),
  mass("suon_heo", "Sườn heo", "pork", ["pork", "food"]),
  mass("thit_bo_bap", "Thịt bò bắp", "beef", ["beef", "food"]),
  mass("thit_bo_xay", "Thịt bò xay", "beef", ["beef", "food"]),
  mass("ca_loc", "Cá lóc", "fish", ["fish", "seafood", "food"]),
  mass("ca_basa", "Cá basa", "fish", ["fish", "seafood", "food"]),
  mass("ca_nuc", "Cá nục", "fish", ["fish", "seafood", "food"]),
  mass("tom_the", "Tôm thẻ", "crustacean", ["crustacean", "seafood", "food"]),
  mass("muc_ong", "Mực ống", "mollusc", ["mollusc", "seafood", "food"]),
  {
    code: "trung_ga",
    nameVi: "Trứng gà",
    categoryCode: "egg",
    ancestry: ["egg", "food"],
    baseUnitCode: "item",
    baseDimension: "count"
  },
  mass("dau_hu_trang", "Đậu hũ trắng", "tofu", ["tofu", "food"]),
  mass("gao_te", "Gạo tẻ", "staple", ["staple", "food"]),
  vegetable("rau_muong", "Rau muống"),
  vegetable("cai_ngot", "Cải ngọt"),
  vegetable("cai_thao", "Cải thảo"),
  vegetable("bap_cai", "Bắp cải"),
  vegetable("rau_den", "Rau dền"),
  vegetable("bi_dao", "Bí đao"),
  vegetable("bi_do", "Bí đỏ"),
  vegetable("muop_huong", "Mướp hương"),
  vegetable("su_su", "Su su"),
  vegetable("ca_chua", "Cà chua"),
  vegetable("ca_rot", "Cà rốt"),
  vegetable("khoai_tay", "Khoai tây"),
  vegetable("dau_cove", "Đậu cô ve"),
  vegetable("gia_do", "Giá đỗ"),
  vegetable("nam_rom", "Nấm rơm"),
  vegetable("hanh_tay", "Hành tây"),
  vegetable("hanh_la", "Hành lá"),
  vegetable("hanh_tim", "Hành tím"),
  vegetable("toi", "Tỏi"),
  vegetable("gung", "Gừng"),
  vegetable("sa", "Sả"),
  vegetable("ot_hiem", "Ớt hiểm"),
  vegetable("rau_ngo", "Rau ngò"),
  vegetable("me_chua", "Me chua"),
  volume("nuoc_mam", "Nước mắm"),
  volume("nuoc_tuong", "Nước tương"),
  volume("dau_an", "Dầu ăn"),
  seasoning("muoi", "Muối"),
  seasoning("duong_cat", "Đường cát"),
  seasoning("tieu_xay", "Tiêu xay"),
  seasoning("hat_nem", "Hạt nêm")
]

/** Standard method shapes. Step text carries no quantity and no time; those are cells to fill. */
export type Method = "kho" | "xao" | "chien" | "luoc" | "canh" | "hap" | "nau"

export interface RecipeSpec {
  readonly code: string
  readonly nameVi: string
  readonly method: Method
  readonly ingredients: readonly string[]
}

export const RECIPES: readonly RecipeSpec[] = [
  { code: "com_trang", nameVi: "Cơm trắng", method: "nau", ingredients: ["gao_te"] },

  // poultry
  {
    code: "ga_kho_gung",
    nameVi: "Gà kho gừng",
    method: "kho",
    ingredients: ["ga_ta", "gung", "hanh_tim", "nuoc_mam", "duong_cat", "tieu_xay", "dau_an"]
  },
  {
    code: "ga_chien_nuoc_mam",
    nameVi: "Gà chiên nước mắm",
    method: "chien",
    ingredients: ["ga_ta", "toi", "nuoc_mam", "duong_cat", "dau_an"]
  },
  {
    code: "ga_xao_sa_ot",
    nameVi: "Gà xào sả ớt",
    method: "xao",
    ingredients: ["ga_ta", "sa", "ot_hiem", "toi", "nuoc_mam", "dau_an"]
  },
  {
    code: "ga_kho_nam",
    nameVi: "Gà kho nấm rơm",
    method: "kho",
    ingredients: ["ga_ta", "nam_rom", "hanh_tim", "nuoc_mam", "tieu_xay", "dau_an"]
  },

  // pork
  {
    code: "thit_kho_trung",
    nameVi: "Thịt kho trứng",
    method: "kho",
    ingredients: ["thit_ba_chi", "trung_ga", "hanh_tim", "nuoc_mam", "duong_cat", "tieu_xay"]
  },
  {
    code: "suon_ram_man",
    nameVi: "Sườn ram mặn",
    method: "kho",
    ingredients: ["suon_heo", "toi", "hanh_tim", "nuoc_mam", "duong_cat", "dau_an"]
  },
  {
    code: "thit_xao_dau_cove",
    nameVi: "Thịt xào đậu cô ve",
    method: "xao",
    ingredients: ["thit_nac_vai", "dau_cove", "toi", "nuoc_mam", "dau_an"]
  },
  {
    code: "thit_xao_hanh_tay",
    nameVi: "Thịt xào hành tây",
    method: "xao",
    ingredients: ["thit_nac_vai", "hanh_tay", "toi", "nuoc_mam", "tieu_xay", "dau_an"]
  },
  {
    code: "suon_kho_khoai_tay",
    nameVi: "Sườn kho khoai tây",
    method: "kho",
    ingredients: ["suon_heo", "khoai_tay", "hanh_tim", "nuoc_mam", "duong_cat"]
  },

  // beef
  {
    code: "bo_xao_gia",
    nameVi: "Bò xào giá",
    method: "xao",
    ingredients: ["thit_bo_bap", "gia_do", "toi", "hanh_la", "nuoc_tuong", "dau_an"]
  },
  {
    code: "bo_kho_ca_rot",
    nameVi: "Bò kho cà rốt",
    method: "kho",
    ingredients: ["thit_bo_bap", "ca_rot", "sa", "hanh_tim", "nuoc_mam", "dau_an"]
  },
  {
    code: "bo_xao_hanh_tay",
    nameVi: "Bò xào hành tây",
    method: "xao",
    ingredients: ["thit_bo_bap", "hanh_tay", "toi", "tieu_xay", "nuoc_tuong", "dau_an"]
  },

  // fish
  {
    code: "ca_loc_kho_to",
    nameVi: "Cá lóc kho tộ",
    method: "kho",
    ingredients: ["ca_loc", "hanh_tim", "ot_hiem", "nuoc_mam", "duong_cat", "tieu_xay"]
  },
  {
    code: "ca_basa_chien_gion",
    nameVi: "Cá basa chiên giòn",
    method: "chien",
    ingredients: ["ca_basa", "muoi", "tieu_xay", "dau_an"]
  },
  {
    code: "ca_nuc_kho_ca_chua",
    nameVi: "Cá nục kho cà chua",
    method: "kho",
    ingredients: ["ca_nuc", "ca_chua", "hanh_tim", "nuoc_mam", "duong_cat"]
  },
  {
    code: "ca_basa_kho_tieu",
    nameVi: "Cá basa kho tiêu",
    method: "kho",
    ingredients: ["ca_basa", "tieu_xay", "hanh_tim", "nuoc_mam", "duong_cat"]
  },

  // crustacean
  {
    code: "tom_rim_man",
    nameVi: "Tôm rim mặn",
    method: "kho",
    ingredients: ["tom_the", "toi", "nuoc_mam", "duong_cat", "tieu_xay", "dau_an"]
  },
  {
    code: "tom_xao_bi_dao",
    nameVi: "Tôm xào bí đao",
    method: "xao",
    ingredients: ["tom_the", "bi_dao", "toi", "nuoc_mam", "dau_an"]
  },

  // mollusc
  {
    code: "muc_xao_ca_chua",
    nameVi: "Mực xào cà chua",
    method: "xao",
    ingredients: ["muc_ong", "ca_chua", "hanh_tay", "toi", "nuoc_mam", "dau_an"]
  },

  // egg
  {
    code: "trung_chien_hanh",
    nameVi: "Trứng chiên hành",
    method: "chien",
    ingredients: ["trung_ga", "hanh_la", "nuoc_mam", "tieu_xay", "dau_an"]
  },
  {
    code: "trung_chien_thit_bam",
    nameVi: "Trứng chiên thịt băm",
    method: "chien",
    ingredients: ["trung_ga", "thit_bo_xay", "hanh_la", "nuoc_mam", "dau_an"]
  },

  // tofu
  {
    code: "dau_hu_sot_ca_chua",
    nameVi: "Đậu hũ sốt cà chua",
    method: "xao",
    ingredients: ["dau_hu_trang", "ca_chua", "hanh_la", "toi", "nuoc_tuong", "dau_an"]
  },
  {
    code: "dau_hu_chien_sa",
    nameVi: "Đậu hũ chiên sả",
    method: "chien",
    ingredients: ["dau_hu_trang", "sa", "ot_hiem", "muoi", "dau_an"]
  },
  {
    code: "dau_hu_kho_nam",
    nameVi: "Đậu hũ kho nấm",
    method: "kho",
    ingredients: ["dau_hu_trang", "nam_rom", "hanh_tim", "nuoc_tuong", "duong_cat"]
  },

  // vegetables
  {
    code: "rau_muong_luoc",
    nameVi: "Rau muống luộc",
    method: "luoc",
    ingredients: ["rau_muong", "muoi"]
  },
  {
    code: "rau_muong_xao_toi",
    nameVi: "Rau muống xào tỏi",
    method: "xao",
    ingredients: ["rau_muong", "toi", "dau_an", "hat_nem"]
  },
  {
    code: "cai_ngot_luoc",
    nameVi: "Cải ngọt luộc",
    method: "luoc",
    ingredients: ["cai_ngot", "muoi"]
  },
  {
    code: "bap_cai_xao",
    nameVi: "Bắp cải xào",
    method: "xao",
    ingredients: ["bap_cai", "toi", "dau_an", "hat_nem"]
  },
  {
    code: "su_su_xao_ca_rot",
    nameVi: "Su su xào cà rốt",
    method: "xao",
    ingredients: ["su_su", "ca_rot", "toi", "dau_an", "hat_nem"]
  },
  {
    code: "muop_xao_toi",
    nameVi: "Mướp xào tỏi",
    method: "xao",
    ingredients: ["muop_huong", "toi", "dau_an", "hat_nem"]
  },
  {
    code: "rau_den_luoc",
    nameVi: "Rau dền luộc",
    method: "luoc",
    ingredients: ["rau_den", "muoi"]
  },

  // soups
  {
    code: "canh_bi_dao_thit_bam",
    nameVi: "Canh bí đao thịt băm",
    method: "canh",
    ingredients: ["bi_dao", "thit_bo_xay", "hanh_la", "hat_nem", "muoi"]
  },
  {
    code: "canh_chua_ca_loc",
    nameVi: "Canh chua cá lóc",
    method: "canh",
    ingredients: ["ca_loc", "me_chua", "ca_chua", "gia_do", "rau_ngo", "nuoc_mam", "duong_cat"]
  },
  {
    code: "canh_cai_thao_thit",
    nameVi: "Canh cải thảo thịt bằm",
    method: "canh",
    ingredients: ["cai_thao", "thit_nac_vai", "hanh_la", "hat_nem"]
  },
  {
    code: "canh_ca_chua_trung",
    nameVi: "Canh cà chua trứng",
    method: "canh",
    ingredients: ["ca_chua", "trung_ga", "hanh_la", "hat_nem", "muoi"]
  },
  {
    code: "canh_bi_do_thit_bam",
    nameVi: "Canh bí đỏ thịt băm",
    method: "canh",
    ingredients: ["bi_do", "thit_bo_xay", "hanh_la", "hat_nem"]
  }
]

export interface MealSpec {
  readonly code: string
  readonly nameVi: string
  readonly proteinHintCode: string
  readonly cookingStyleCodes: readonly string[]
  /** [recipeCode, mealRole] in serving order; com_trang is added as the staple automatically. */
  readonly components: readonly (readonly [string, "main" | "vegetable" | "soup" | "side"])[]
}

export const MEALS: readonly MealSpec[] = [
  {
    code: "com_ga_kho_gung_rau_muong",
    nameVi: "Cơm gà kho gừng, rau muống luộc",
    proteinHintCode: "poultry",
    cookingStyleCodes: ["kho", "luoc"],
    components: [
      ["ga_kho_gung", "main"],
      ["rau_muong_luoc", "vegetable"]
    ]
  },
  {
    code: "com_ga_chien_mam_bap_cai",
    nameVi: "Cơm gà chiên nước mắm, bắp cải xào",
    proteinHintCode: "poultry",
    cookingStyleCodes: ["chien", "xao"],
    components: [
      ["ga_chien_nuoc_mam", "main"],
      ["bap_cai_xao", "vegetable"]
    ]
  },
  {
    code: "com_ga_xao_sa_ot_canh_bi_dao",
    nameVi: "Cơm gà xào sả ớt, canh bí đao",
    proteinHintCode: "poultry",
    cookingStyleCodes: ["xao", "canh"],
    components: [
      ["ga_xao_sa_ot", "main"],
      ["canh_bi_dao_thit_bam", "soup"]
    ]
  },
  {
    code: "com_ga_kho_nam_cai_ngot",
    nameVi: "Cơm gà kho nấm, cải ngọt luộc",
    proteinHintCode: "poultry",
    cookingStyleCodes: ["kho", "luoc"],
    components: [
      ["ga_kho_nam", "main"],
      ["cai_ngot_luoc", "vegetable"]
    ]
  },

  {
    code: "com_thit_kho_trung_rau_muong",
    nameVi: "Cơm thịt kho trứng, rau muống xào tỏi",
    proteinHintCode: "pork",
    cookingStyleCodes: ["kho", "xao"],
    components: [
      ["thit_kho_trung", "main"],
      ["rau_muong_xao_toi", "vegetable"]
    ]
  },
  {
    code: "com_suon_ram_man_canh_cai_thao",
    nameVi: "Cơm sườn ram mặn, canh cải thảo",
    proteinHintCode: "pork",
    cookingStyleCodes: ["kho", "canh"],
    components: [
      ["suon_ram_man", "main"],
      ["canh_cai_thao_thit", "soup"]
    ]
  },
  {
    code: "com_thit_xao_dau_cove_canh_bi_do",
    nameVi: "Cơm thịt xào đậu cô ve, canh bí đỏ",
    proteinHintCode: "pork",
    cookingStyleCodes: ["xao", "canh"],
    components: [
      ["thit_xao_dau_cove", "main"],
      ["canh_bi_do_thit_bam", "soup"]
    ]
  },
  {
    code: "com_thit_xao_hanh_tay_rau_den",
    nameVi: "Cơm thịt xào hành tây, rau dền luộc",
    proteinHintCode: "pork",
    cookingStyleCodes: ["xao", "luoc"],
    components: [
      ["thit_xao_hanh_tay", "main"],
      ["rau_den_luoc", "vegetable"]
    ]
  },
  {
    code: "com_suon_kho_khoai_tay_cai_ngot",
    nameVi: "Cơm sườn kho khoai tây, cải ngọt luộc",
    proteinHintCode: "pork",
    cookingStyleCodes: ["kho", "luoc"],
    components: [
      ["suon_kho_khoai_tay", "main"],
      ["cai_ngot_luoc", "vegetable"]
    ]
  },

  {
    code: "com_bo_xao_gia_canh_ca_chua_trung",
    nameVi: "Cơm bò xào giá, canh cà chua trứng",
    proteinHintCode: "beef",
    cookingStyleCodes: ["xao", "canh"],
    components: [
      ["bo_xao_gia", "main"],
      ["canh_ca_chua_trung", "soup"]
    ]
  },
  {
    code: "com_bo_kho_ca_rot_rau_muong",
    nameVi: "Cơm bò kho cà rốt, rau muống luộc",
    proteinHintCode: "beef",
    cookingStyleCodes: ["kho", "luoc"],
    components: [
      ["bo_kho_ca_rot", "main"],
      ["rau_muong_luoc", "vegetable"]
    ]
  },
  {
    code: "com_bo_xao_hanh_tay_muop_xao",
    nameVi: "Cơm bò xào hành tây, mướp xào tỏi",
    proteinHintCode: "beef",
    cookingStyleCodes: ["xao"],
    components: [
      ["bo_xao_hanh_tay", "main"],
      ["muop_xao_toi", "vegetable"]
    ]
  },

  {
    code: "com_ca_loc_kho_to_canh_chua",
    nameVi: "Cơm cá lóc kho tộ, canh chua cá lóc",
    proteinHintCode: "fish",
    cookingStyleCodes: ["kho", "canh"],
    components: [
      ["ca_loc_kho_to", "main"],
      ["canh_chua_ca_loc", "soup"]
    ]
  },
  {
    code: "com_ca_basa_chien_bap_cai",
    nameVi: "Cơm cá basa chiên giòn, bắp cải xào",
    proteinHintCode: "fish",
    cookingStyleCodes: ["chien", "xao"],
    components: [
      ["ca_basa_chien_gion", "main"],
      ["bap_cai_xao", "vegetable"]
    ]
  },
  {
    code: "com_ca_nuc_kho_ca_chua_rau_den",
    nameVi: "Cơm cá nục kho cà chua, rau dền luộc",
    proteinHintCode: "fish",
    cookingStyleCodes: ["kho", "luoc"],
    components: [
      ["ca_nuc_kho_ca_chua", "main"],
      ["rau_den_luoc", "vegetable"]
    ]
  },
  {
    code: "com_ca_basa_kho_tieu_su_su",
    nameVi: "Cơm cá basa kho tiêu, su su xào cà rốt",
    proteinHintCode: "fish",
    cookingStyleCodes: ["kho", "xao"],
    components: [
      ["ca_basa_kho_tieu", "main"],
      ["su_su_xao_ca_rot", "vegetable"]
    ]
  },

  {
    code: "com_tom_rim_man_canh_bi_dao",
    nameVi: "Cơm tôm rim mặn, canh bí đao",
    proteinHintCode: "crustacean",
    cookingStyleCodes: ["kho", "canh"],
    components: [
      ["tom_rim_man", "main"],
      ["canh_bi_dao_thit_bam", "soup"]
    ]
  },
  {
    code: "com_tom_xao_bi_dao_cai_ngot",
    nameVi: "Cơm tôm xào bí đao, cải ngọt luộc",
    proteinHintCode: "crustacean",
    cookingStyleCodes: ["xao", "luoc"],
    components: [
      ["tom_xao_bi_dao", "main"],
      ["cai_ngot_luoc", "vegetable"]
    ]
  },

  {
    code: "com_muc_xao_ca_chua_rau_muong",
    nameVi: "Cơm mực xào cà chua, rau muống xào tỏi",
    proteinHintCode: "mollusc",
    cookingStyleCodes: ["xao"],
    components: [
      ["muc_xao_ca_chua", "main"],
      ["rau_muong_xao_toi", "vegetable"]
    ]
  },

  {
    code: "com_trung_chien_hanh_canh_bi_do",
    nameVi: "Cơm trứng chiên hành, canh bí đỏ",
    proteinHintCode: "egg",
    cookingStyleCodes: ["chien", "canh"],
    components: [
      ["trung_chien_hanh", "main"],
      ["canh_bi_do_thit_bam", "soup"]
    ]
  },
  {
    code: "com_trung_chien_thit_bam_bap_cai",
    nameVi: "Cơm trứng chiên thịt băm, bắp cải xào",
    proteinHintCode: "egg",
    cookingStyleCodes: ["chien", "xao"],
    components: [
      ["trung_chien_thit_bam", "main"],
      ["bap_cai_xao", "vegetable"]
    ]
  },

  {
    code: "com_dau_hu_sot_ca_chua_rau_muong",
    nameVi: "Cơm đậu hũ sốt cà chua, rau muống luộc",
    proteinHintCode: "tofu",
    cookingStyleCodes: ["xao", "luoc"],
    components: [
      ["dau_hu_sot_ca_chua", "main"],
      ["rau_muong_luoc", "vegetable"]
    ]
  },
  {
    code: "com_dau_hu_chien_sa_cai_ngot",
    nameVi: "Cơm đậu hũ chiên sả, cải ngọt luộc",
    proteinHintCode: "tofu",
    cookingStyleCodes: ["chien", "luoc"],
    components: [
      ["dau_hu_chien_sa", "main"],
      ["cai_ngot_luoc", "vegetable"]
    ]
  },
  {
    code: "com_dau_hu_kho_nam_muop_xao",
    nameVi: "Cơm đậu hũ kho nấm, mướp xào tỏi",
    proteinHintCode: "tofu",
    cookingStyleCodes: ["kho", "xao"],
    components: [
      ["dau_hu_kho_nam", "main"],
      ["muop_xao_toi", "vegetable"]
    ]
  }
]
