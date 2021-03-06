var mapAttributesWithSum = function(from, to, map) {
    _.each(from, function(v, k) {
        if (map[k]) {
            if (to[map[k].to] == undefined)
                to[map[k].to] = 0;
            if (map[k].attr)
                to[map[k].to] += v[map[k].attr];
            else
                to[map[k].to] += v;
        }
    });
};

var StatsModel = Backbone.Model.extend({
    initialize: function() {

    },
    'defaults' : {
        'dex': 0,
        'vit': 0,
        'str': 0,
        'int': 0,
        'cc': 0,
        'cdmg': 0,
        'mindmg': 0,
        'maxdmg': 0,
        'deltadmg': 0
    }
});

var SimulationModel = Backbone.Model.extend({

    initialize: function() {
        this.gear = {};
        this.gear.head = new ItemCollection();
        this.gear.head.on('change', this.updateGearStatsWithSets, this);
        this.gear.head.on('add', this.checkItemOnAdd, this);
        this.gear.shoulders = new ItemCollection();
        this.gear.shoulders.on('change', this.updateGearStatsWithSets, this);
        this.gear.neck = new ItemCollection();
        this.gear.neck.on('change', this.updateGearStatsWithSets, this);
        this.gear.hands = new ItemCollection();
        this.gear.hands.on('change', this.updateGearStatsWithSets, this);
        this.gear.torso = new ItemCollection();
        this.gear.torso.on('change', this.updateGearStatsWithSets, this);
        this.gear.bracers = new ItemCollection();
        this.gear.bracers.on('change', this.updateGearStatsWithSets, this);
        this.gear.leftFinger = new ItemCollection();
        this.gear.leftFinger.on('change', this.updateGearStatsWithSets, this);
        this.gear.rightFinger = new ItemCollection();
        this.gear.rightFinger.on('change', this.updateGearStatsWithSets, this);
        this.gear.waist = new ItemCollection();
        this.gear.waist.on('change', this.updateGearStatsWithSets, this);
        this.gear.legs = new ItemCollection();
        this.gear.legs.on('change', this.updateGearStatsWithSets, this);
        this.gear.feet = new ItemCollection();
        this.gear.feet.on('change', this.updateGearStatsWithSets, this);
        this.gear.mainHand = new ItemCollection();
        this.gear.mainHand.on('change', this.updateGearStatsWithSets, this);
        this.gear.offHand = new ItemCollection();
        this.gear.offHand.on('change', this.updateGearStatsWithSets, this);
        this.gear.setBonuses = new ItemCollection();
        this.gear.setBonuses.on('change', this.updateGearStatsWithoutSets, this);

        this.heroStats = new StatsModel();  // Hero-based stats, used to estimate set bonuses
        this.baseStats = new StatsModel();  // Default stats and stats after level
        this.gearStats = new StatsModel();  // Base stats + stats after gear
    },

    loadFromHero: function(hero) {
        _.each(hero.get('items'), function(itemRaw, slot) {
            var collection = this.gear[slot];
            if (!collection)
                return;

            var item = new Item(itemRaw);
            item.fetch(); // load details

            if (collection.length == 0) {
                collection.add(item);
            } else {
                collection.at(0).clear({silent: true});
                collection.at(0).set(item);
            }
        }, this);

        this.updateBaseStats(hero);
    },

    checkItemOnAdd: function(item, collection, options) {
        if (!item.get('name')) {
            item.set({'name': 'Item #' + options.index});
        }
    },

    updateGearStatsWithSets: function() {
        return this.updateGearStats(true);
    },

    updateGearStatsWithoutSets: function() {
        return this.updateGearStats(false);
    },

    updateGearStats : function(updateSets) {
        var sets = {};
        var hasSets = false;
        var updObj = {};
        _.each(this.allStats, function(stat) {
            updObj[stat] = 0;
        });
        _.each(this.gear, function(items, slot) {
            if (!items.length)
                return;
            var item = items.at(0);
            _.each(this.allStats, function(stat) {
                updObj[stat] += (item.get(stat) || 0);
            });
            var setInfo = item.get('set');
            if (setInfo) {
                if (sets[setInfo['slug']]) {
                    sets[setInfo['slug']]++;
                    hasSets = true;
                } else {
                    sets[setInfo['slug']] = 1;
                }
            }
        }, this);

        this.gearStats.set(this.sumStats(this.baseStats.attributes, updObj, this.allStats));

        if (hasSets && updateSets) {
            var itemRaw = this.diffStats(this.heroStats.attributes, this.gearStats.attributes, this.allStats);
            var item = new Item(itemRaw);
            item.set({'name': 'Unknown Set'});
            item.set({'displayColor': 'green'});

            if (this.gear.setBonuses.length == 0) {
                this.gear.setBonuses.add(item);
            } else {
                this.gear.setBonuses.at(0).clear({silent: true});
                this.gear.setBonuses.at(0).set(item);
            }
        }

        updObj = {};
        updObj.weapon_dps = 0;
        var mainHandWeapon = this.gear.mainHand.at(0);
        var offHandWeapon = this.gear.offHand.at(0);

        var mh_dph, mh_w_aps, mh_aps, mh_dps, mh_dps_unbuffed;
        if (mainHandWeapon && mainHandWeapon.get('dps') > 0) {
            mh_w_aps = mainHandWeapon.get('attacksPerSecond');
            mh_dph = (mainHandWeapon.get('wmindmg') + mainHandWeapon.get('wmaxdmg')) / 2.0;
            mh_aps = mh_w_aps * (1 + this.gearStats.get('ias'));
            mh_dps = (mh_dph + (this.gearStats.get('mindmg') + this.gearStats.get('maxdmg')) / 2.0) * mh_aps;
            mh_dps_unbuffed = mh_dps *
                    (1 + (this.gearStats.get(this.get('dmgstat')) / 100)) *
                    (1 + this.gearStats.get('cc') * this.gearStats.get('cdmg'));
        }

        var oh_dph, oh_w_aps = 0, oh_aps, oh_dps, oh_dps_unbuffed;
        if (offHandWeapon && offHandWeapon.get('dps') > 0) {
            oh_w_aps = offHandWeapon.get('attacksPerSecond');
            oh_dph = (offHandWeapon.get('wmindmg') + offHandWeapon.get('wmaxdmg')) / 2.0;
            oh_aps = oh_w_aps * (1 + this.gearStats.get('ias'));
            oh_dps = (oh_dph + (this.gearStats.get('mindmg') + this.gearStats.get('maxdmg')) / 2.0) * oh_aps;
            oh_dps_unbuffed = oh_dps * (1 + (this.gearStats.get(this.get('dmgstat')) / 100)) *
                    (1 + this.gearStats.get('cc') * this.gearStats.get('cdmg'));
        }

        var ias = this.gearStats.get('ias');
        var cc = this.gearStats.get('cc');
        var cdmg = this.gearStats.get('cdmg');
        var minbonus = this.gearStats.get('mindmg');
        var maxbonus = this.gearStats.get('maxdmg');
        var dmgstatval = this.gearStats.get(this.get('dmgstat'));


        /*
                (
                    (1 + passive skill boosts) *
                    (Weapon 1 average damage + ((minimum damage bonus + maximum damage bonus)/2)) *
                    (Weapon Damage Multipliers) *
                    (Attack Speed)*
                    (1 + ( crit% * crit damage %))*
                    ( 1 + (main stat / 100))*
                    (average attack speed of both weapons / weapon 1 attack speed)

                + (1 + passive skill boosts)*(Weapon 2 average damage + ((minimum damage bonus + maximum damage bonus)/2))*(Weapon Damage Multipliers)*(Attack Speed)*(1 + ( crit% * crit damage %))*( 1 + (main stat / 100))*(average attack speed of both weapons / weapon 2 attack speed)
                ) * 0.575
        */
        var baseMainAPS = mh_w_aps;
        var baseOffAPS = oh_w_aps;
        var baseMainMinDmg = mainHandWeapon.get('wmindmg');
        var baseMainMaxDmg = mainHandWeapon.get('wmaxdmg');
        var baseOffMinDmg = offHandWeapon.get('wmindmg');
        var baseOffMaxDmg = offHandWeapon.get('wmaxdmg');

        // TODO: fill these values
        var mainBonusAps = 0;
        var offBonusAps = 0;
        var bonusDmgPer = 0;

        var mainAvgWDmg = (baseMainMinDmg + baseMainMaxDmg) / 2;
        var offAvgWDmg = (baseOffMinDmg + baseOffMaxDmg) / 2;
        var gearAvgBonusDmg = (minbonus + maxbonus) / 2;

        var total =
            baseMainAPS == 0 ? 0 : 1 / ((1 / (baseMainAPS + offBonusAps) + (baseOffAPS == 0 ? 0 : 1) / (baseOffAPS == 0 ? 1 : baseOffAPS + mainBonusAps)) / (baseOffAPS == 0 ? 1 : 2))
            * (1 + ias + (baseOffAPS == 0 ? 0 : .15))
            * (((1 - cc) * ((mainAvgWDmg + gearAvgBonusDmg) *  (1 + dmgstatval / 100) * (1 + bonusDmgPer / 100))
                    + cc * ((mainAvgWDmg + gearAvgBonusDmg) * (1 + dmgstatval / 100) * (1 + bonusDmgPer / 100) * (1 + cdmg))
                    + ((1 - cc) * (baseOffAPS == 0 ? 0 : (offAvgWDmg + gearAvgBonusDmg) * (1 + dmgstatval / 100) * (1 + bonusDmgPer / 100))
                        + cc * ((baseOffAPS == 0 ? 0 : (offAvgWDmg + gearAvgBonusDmg) * (1 + dmgstatval / 100) * (1 + bonusDmgPer / 100)) * (1 + cdmg)))
                ) / (baseOffAPS == 0 ? 1 : 2)
            );

        updObj.dps_unbuffed = total;


//        var avg_as = ((mh_w_aps * (DW +  ias) + oh_w_aps * (DW +  ias)) / 2).toFixed(2);
//
//        var ias2 = 0;
//
//        var avg_mdg_with_dw = (
//            (mh_dph + (minbonus + maxbonus) / 2.0) *
//                (1 + cc * cdmg) * (1 + (dmgstatval / 100)) * mh_w_aps * (1 + ias) *
//                (avg_as / (mh_w_aps * (DW + ias)))
//        +
//            (oh_dph + (minbonus + maxbonus) / 2.0) *
//                (1 + cc * cdmg) * (1 + (dmgstatval / 100)) * oh_w_aps * (1 + ias) *
//                (avg_as / (oh_w_aps * (DW + ias)))
//            ) * 0.575;
//
//                ((mh_w_aps * DW)/((mh_w_aps * DW) + (oh_w_aps * DW))) +
//                (oh_dph + (this.gearStats.get('mindmg') + this.gearStats.get('maxdmg') / 2.0)) *
//                ((oh_w_aps * DW)/((mh_w_aps * DW) + (oh_w_aps * DW))) + elem_dmg;



//        var avg_as = ((mh_w_aps * (DW + ias) + oh_w_aps * (1.15 + ias)) / 2.0);
//
//        var dps = avg_mdg_with_dw * avg_as * (1 + cc * cdmg) * (1 + dmgstatval / 100);
//        var dps = avg_mdg_with_dw;

//        updObj.dps_unbuffed = dps;
//
//        if (oh_dps_unbuffed && mh_dps_unbuffed) { // two weapons
//            var average_weapons_aps = (oh_aps + mh_aps) / 2.0; // mainHandWeapon.get('attacksPerSecond') + offHandWeapon.get('attacksPerSecond') / 2.0;
//            updObj.dps_unbuffed = ((mh_dps_unbuffed * average_weapons_aps / oh_aps) +
//                    (oh_dps_unbuffed * average_weapons_aps / mh_aps)) * 0.575;
//        } else {
//            updObj.dps_unbuffed = mh_dps_unbuffed || oh_dps_unbuffed;
//        }
        this.set(updObj);
    },

    sumStats : function(a, b, stats) {
        var res = {};
        _.each(stats, function(stat) {
            res[stat] = (a[stat] || 0) + (b[stat] || 0);
        });
        return res;
    },

    diffStats : function(a, b, stats) {
        var res = {};
        _.each(stats, function(stat) {
            if (!a[stat])
                return;
            res[stat] =  a[stat] - (b[stat] || 0);
            if (res[stat] < 0.01) {
                delete res[stat];
            }

        });
        return res;
    },

    heroBaseStatsMappings:{
        attackSpeed: {to: 'as'},
        armor: {to: 'def'},
        strength:{to: 'str'},
        dexterity:{to: 'dex'},
        vitality:{to: 'vit'},
        intelligence:{to: 'int'},
//        physicalResist:431,
//        fireResist:390,
//        coldResist:421,
//        lightningResist:418,
//        poisonResist:390,
//        arcaneResist:390,
        critDamage:{to: 'cdmg'},
//        damageIncrease:22.389999389648438,
        critChance:{to: 'cc'},
//        damageReduction:0.5502920150756836,
//        blockChance:0,
//        thorns:558,
//        lifeSteal:0,
//        lifePerKill:0,
        goldFind:{to: 'gf'},
        magicFind:{to: 'mf'}
//        blockAmountMin:0,
//        blockAmountMax:0,
//        lifeOnHit:0,
//        primaryResource:125,
//        secondaryResource:30
    },

    updateBaseStats : function(hero) {
        var heroClass = hero.get('class');
        if (!heroClass)
            return;
        var updObj = {};
        mapAttributesWithSum(hero.get('stats'), updObj, this.heroBaseStatsMappings);
        updObj.cdmg--;  // there is a total critdamage value (i.e. 100% + gear cdmg bonuses) so we subtract 1 from it
        this.heroStats.set(updObj);

        var absLevel = hero.get('level') + hero.get('paragonLevel');
        var basestat = this.base_stats[heroClass];

        var statAfterLevel = function(level, stat, basestat) {
            if (stat == 'vit')
                return 9 + 2 * (level - 1);
            if (stat == basestat)
                return 10 + 3 * (level - 1);
            return 8 + (level - 1);
        };

        updObj = {};
        _.each(this.levelBasedStats, function(stat) {
            updObj[stat] = statAfterLevel(absLevel, stat, basestat);
        });
        updObj.cc = 0.05;
        updObj.cdmg = 0.5;

        this.set({dmgstat: basestat});
        this.baseStats.set(updObj);
    },

    allStats: ['str', 'dex', 'int', 'vit', 'cc', 'cdmg', 'mindmg', 'maxdmg', 'deltadmg', 'ias', 'weapon_dps'],

    levelBasedStats: ['str', 'dex', 'int', 'vit'],

    base_stats: {
        'demon-hunter': 'dex',
        'monk': 'dex',
        'wizard': 'int'
    },

    'defaults' : {
        'dmgstat': 'dex'
    }
});

var Item = Backbone.Model.extend({

    url: 'http://eu.battle.net/api/d3/data/',

    fetch: function() {
        var itemId = this.get('tooltipParams');
        if (!itemId)
            return;

        var self = this;

        this.set({loading: this.get('loading') + 1});
        $.ajax({
            url:self.url + itemId,
            dataType:"jsonp",
            success:function (data) {
                if (!data.name) {
                    self.set({loading:self.get('loading') - 1, loadingFailed: true, lastTriedItemId: itemId});
                    return;
                }
                self.set({loading:self.get('loading') - 1, loadingFailed: false});
                self.updateStats(data);
            }, error: function() {
                self.set({loading:self.get('loading') - 1, loadingFailed: true, lastTriedItemId: itemId});
            }
        });
    },

    updateStats: function(data) {
        var updObj = {};
        mapAttributesWithSum(data.attributesRaw, updObj, this.attributesRawDataMappings);
        _.each(data.gems, function (gem) {
            mapAttributesWithSum(gem.attributesRaw, updObj, this.attributesRawDataMappings);
        }, this);
        mapAttributesWithSum(data, updObj, this.commonDataMappings);
        updObj.type = data.type.id;
        updObj.twoHanded = data.type.twoHanded;
        updObj.set = data.set;
        updObj.tooltipParams = data.tooltipParams;

        if (data.dps) { // calc weapon stats
            var js_wd_phys_min = 0;
            var js_wd_phys_delta = 0;
            var js_wd_elem_min = 0;
            var js_wd_elem_delta = 0;
            var js_wd_phys_bon_min = updObj.wdbonusmin || 0;
            var js_wd_phys_bon_delta = updObj.wdbonusdelta || 0;
            var js_wd_phys_bon_perc = 0;

            _.each(data.attributesRaw, function(obj, attr) {
                var val = obj['min'];
                if (attr == 'Damage_Weapon_Min#Physical')
                    js_wd_phys_min = val;
                else if (attr == 'Damage_Weapon_Delta#Physical')
                    js_wd_phys_delta = val;
                else if (attr == 'Damage_Weapon_Percent_Bonus#Physical')
                    js_wd_phys_bon_perc = val;
                else if (attr.match('^Damage_Weapon_Min#') && !attr.match('#Physical$'))
                    js_wd_elem_min = val;
                else if (attr.match('^Damage_Weapon_Delta#') && !attr.match('#Physical$'))
                    js_wd_elem_delta = val;
            });

            var wd_phys_min = js_wd_phys_min + js_wd_phys_bon_min;
            var minDmg = wd_phys_min * (1 + js_wd_phys_bon_perc) + js_wd_elem_min;

            var wd_phys_max_base = js_wd_phys_min + js_wd_phys_delta;
            if (wd_phys_max_base < wd_phys_min)
                wd_phys_max_base = wd_phys_min + 1;
            var maxDmg = (wd_phys_max_base + js_wd_phys_bon_delta) * (1 + js_wd_phys_bon_perc)
                + js_wd_elem_min + js_wd_elem_delta;

            updObj.wmindmg = minDmg;
            updObj.wmaxdmg = maxDmg;
        }

        if (updObj.mindmg && updObj.deltadmg)
            updObj.maxdmg = updObj.mindmg + updObj.deltadmg;

        this.set(updObj);
    },

    shortcut: function() {
        var sc = [];
        var isWeapon = this.get('dps');
        if (isWeapon) {
            sc.push(this.get('twoHanded') ? '2h' : '1h');
            sc.push(this.get('wmindmg') + '-' + this.get('wmaxdmg') + '@' + this.get('aps').toFixed(2));
        }
        _.each(this.scStats, function(stat) {
            var val = this.get(stat);
            if (val > 0) {
                sc.push(val + '' + stat);
            }
        }, this);
        return sc.join(' ');
    },

    loadFromShortcut: function (shortcut) {
        var updObj = {};
        var sc = shortcut.split(/\\s+/);

        var weaponRE = /^(\d+)-(\d+)@(\d+)$/;
        var dmgBonus = /^\+?(\d+)-(\d+)dmg$/;

        _.each(sc, function(part) {
            if (part.contains('@')) {

                 var res = weaponRE.exec(sc[0]);
                 updObj.minDamage = res[0];
                 updObj.maxDamage = res[1];
                 updObj.aps = res[2];
            } else if (dmgBonus.exec(part)) {

            }
        });

        if (sc.length){


        }


        this.clear({silent: true});
    },

    scStats: ['def', 'vit', 'dex', 'int', 'str', 'cc', 'cdmg', 'ias'],

    commonDataMappings: {
        'attacksPerSecond': {to: 'attacksPerSecond', attr: 'min'},
        'dps': {to: 'dps', attr: 'min'},
        'minDamage': {to: 'minDamage', attr: 'min'},
        'maxDamage': {to: 'maxDamage', attr: 'min'}
    },

    attributesRawDataMappings: {
        'Dexterity_Item': {to: 'dex', attr: 'min'},
        'Vitality_Item': {to: 'vit', attr: 'min'},
        'Intelligence_Item': {to: 'int', attr: 'min'},
        'Strength_Item': {to: 'str', attr: 'min'},
        'Crit_Percent_Bonus_Capped': {to: 'cc', attr: 'min'},
        'Crit_Damage_Percent': {to: 'cdmg', attr: 'min'},
        'Attacks_Per_Second_Percent': {to: 'ias', attr: 'min'},
        'Damage_Min#Physical': {to: 'mindmg', attr: 'min'},
        'Damage_Delta#Physical' : {to: 'deltadmg', attr: 'min'},
        'Damage_Weapon_Bonus_Min#Physical' : {to: 'wdbonusmin', attr: 'min'},
        'Damage_Weapon_Bonus_Delta#Physical' : {to: 'wdbonusdelta', attr: 'min'}

    },

    defaults : {
        name:   null,
        vit:    0,
        dex:    0,
        'int':    0,
        str:    0,
        def:    0,
        cc:     0,
        cdmg:   0,
        ias:    0,
        mindmg: 0,
        deltadmg:   0,
        maxdmg: 0,
        set: null,
        displayColor: 'grey',
        tooltipParams: null,
        loading: 0
//        base_resist:  0,
//        base_dodge:   0,
//        extra_life:   0,
//        base_melee_reduc:   0,
//        base_ranged_reduc:  0,
//        block_chance:    0,
//        min_block_value: 0,
//        max_block_value: 0
    }

});


var ItemCollection = Backbone.Collection.extend({
    model: Item,

    loadFromHero: function (hero) {
        this.reset();

        _.each(hero.get('items'), function(item, slot) {
            var itemObj = new Item(item);
            itemObj.set({'slot': slot});
            this.add(itemObj);
        }, this);
    }
});