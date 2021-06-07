<template>
  <div>
    <h1>{{ faction.name }}</h1>
    <v-btn-toggle max="0" multiple>
      <v-btn v-if="isMonitored" color="primary" outlined @click="stopMonitor"> Stop Monitoring </v-btn>
      <v-btn v-else color="primary" @click="monitor"> Monitor Faction </v-btn>
      <v-btn
        :href="`https://eddb.io/faction/${faction.eddb_id}`"
        color="primary"
        rel="noopener noreferrer"
        target="_blank"
      >
        EDDB
      </v-btn>
    </v-btn-toggle>
    <v-row class="pt-8">
      <v-col cols="12" lg="4" md="6" sm="12" xl="3"> <b>Government : </b>{{ faction.government }} </v-col>
      <v-col cols="12" lg="4" md="6" sm="12" xl="3"> <b>Allegiance : </b>{{ faction.allegiance }} </v-col>
      <v-col cols="12" lg="4" md="6" sm="12" xl="3"> <b>Systems Presence : </b>{{ systemsPresence }} </v-col>
      <v-col cols="12" lg="4" md="6" sm="12" xl="3"> <b>Systems Controlled : </b>{{ systemsControlled }} </v-col>
    </v-row>
    <v-form>
      <v-row>
        <v-col cols="12" sm="6">
          <v-text-field v-model="factionFilter" hint="Faction name/state/happiness" label="Filter"></v-text-field>
        </v-col>
      </v-row>
    </v-form>
    <faction-table :faction-filter="factionFilter" :loading="loading" :system-details="systemDetails" />
    <h2 class="py-8">Conflicts</h2>
    <v-data-table
      v-if="conflicts && conflicts.length > 0"
      :headers="conflictHeaders"
      :items="conflicts"
      class="elevation-1"
      dense
      hide-default-footer
    >
      <template v-slot:[`item.stake`]="{ item }">
        {{ getConflictStakeMessage(item.stake) }}
      </template>
      <template v-slot:[`item.days_won`]="{ item }">
        <template v-if="item.days_won">
          {{ item.days_won }}
        </template>
        <template v-else> 0 </template>
      </template>
    </v-data-table>
    <p v-else-if="loading">Loading...</p>
    <p v-else>Faction not in a conflict anywhere</p>
    <h2 class="py-8">Date Filter</h2>
    <v-row>
      <v-col cols="12" sm="6">
        <v-menu
          ref="datepickerRef"
          v-model="datePickerMenu"
          :close-on-content-click="false"
          min-width="auto"
          offset-y
          transition="scale-transition"
          @update:return-value="onChangedFilterDates"
        >
          <template v-slot:activator="{ on, attrs }">
            <v-text-field
              v-bind="attrs"
              v-on="on"
              :value="datePickerDisplay"
              label="Click to select date range (UTC)"
              prepend-icon="event"
              readonly
            ></v-text-field>
          </template>
          <v-date-picker v-model="changedFilterDates" :show-current="currentUtcDate" range show-adjacent-months>
            <v-row>
              <v-col cols="12" sm="6">
                <v-btn block color="error" text @click="datePickerMenu = false"> Cancel </v-btn>
              </v-col>
              <v-col cols="12" sm="6">
                <v-btn block color="success" text @click="$refs.datepickerRef.save(changedFilterDates)"> OK </v-btn>
              </v-col>
            </v-row>
          </v-date-picker>
        </v-menu>
      </v-col>
    </v-row>
    <v-card>
      <v-card-title> Graphs </v-card-title>
      <v-expansion-panels v-model="chartsPanel" accordion multiple>
        <v-expansion-panel>
          <v-expansion-panel-header class="py-0"> Influences </v-expansion-panel-header>
          <v-expansion-panel-content class="custom-padding">
            <faction-influence-chart :faction-data="faction" />
          </v-expansion-panel-content>
        </v-expansion-panel>
        <v-expansion-panel>
          <v-expansion-panel-header class="py-0"> State Periods </v-expansion-panel-header>
          <v-expansion-panel-content class="custom-padding">
            <faction-state-chart :faction-data="faction" />
          </v-expansion-panel-content>
        </v-expansion-panel>
        <v-expansion-panel>
          <v-expansion-panel-header class="py-0"> Active State Periods </v-expansion-panel-header>
          <v-expansion-panel-content class="custom-padding">
            <faction-state-apr-chart :faction-data="faction" type="active" />
          </v-expansion-panel-content>
        </v-expansion-panel>
        <v-expansion-panel>
          <v-expansion-panel-header class="py-0"> Pending State Periods </v-expansion-panel-header>
          <v-expansion-panel-content class="custom-padding">
            <faction-state-apr-chart :faction-data="faction" type="pending" />
          </v-expansion-panel-content>
        </v-expansion-panel>
        <v-expansion-panel>
          <v-expansion-panel-header class="py-0"> Recovering State Periods </v-expansion-panel-header>
          <v-expansion-panel-content class="custom-padding">
            <faction-state-apr-chart :faction-data="faction" type="recovering" />
          </v-expansion-panel-content>
        </v-expansion-panel>
        <v-expansion-panel>
          <v-expansion-panel-header class="py-0"> Happiness Periods </v-expansion-panel-header>
          <v-expansion-panel-content class="custom-padding">
            <faction-happiness-chart :faction-data="faction" />
          </v-expansion-panel-content>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card>
  </div>
</template>

<script>
import { mapGetters, mapMutations, mapState } from 'vuex'
import moment from 'moment'
import FactionInfluenceChart from '@/components/charts/FactionInfluenceChart'
import FactionStateChart from '@/components/charts/FactionStateChart'
import FactionAPRStateChart from '@/components/charts/FactionAPRStateChart'
import FactionHappinessChart from '@/components/charts/FactionHappinessChart'
import componentMethods from '@/mixins/componentMethods'
import FactionTable from '@/components/main/factions/FactionTable'

export default {
  name: 'FactionView',
  components: {
    'faction-table': FactionTable,
    'faction-influence-chart': FactionInfluenceChart,
    'faction-state-chart': FactionStateChart,
    'faction-state-apr-chart': FactionAPRStateChart,
    'faction-happiness-chart': FactionHappinessChart
  },
  mixins: [componentMethods],
  data() {
    return {
      loading: false,
      conflicts: [],
      systemsPresence: 0,
      systemsControlled: 0,
      factionFilter: '',
      conflictsPanel: [],
      filterDates: [],
      changedFilterDates: [],
      datePickerMenu: false,
      currentUtcDate: '',
      dateFormat: 'YYYY-MM-DD',
      conflictHeaders: [
        {
          text: 'System Name',
          value: 'system_name'
        },
        {
          text: 'Conflict Type',
          value: 'type'
        },
        {
          text: 'Conflict Status',
          value: 'status'
        },
        {
          text: 'Opponent Name',
          value: 'opponent_name'
        },
        {
          text: 'Stake',
          value: 'stake'
        },
        {
          text: 'Days Won',
          value: 'days_won'
        }
      ],
      chartsPanel: [0, 1, 2, 3, 4, 5]
    }
  },
  props: {
    factionId: {
      type: String,
      default: ''
    }
  },
  async created() {
    this.filterDates = [
      moment().subtract(10, 'days').utc().format(this.dateFormat),
      moment().utc().format(this.dateFormat)
    ]
    this.changedFilterDates = this.filterDates
    this.currentUtcDate = moment().utc().format(this.dateFormat)
    await this.checkRedirect()
    this.fetchFactionWithHistoryById()
  },
  computed: {
    ...mapGetters({
      faction: 'friendlyFaction'
    }),
    ...mapState({
      authUser: (state) => state.auth.user
    }),
    isMonitored() {
      return this.authUser?.factions?.findIndex((faction) => faction.id === this.faction._id) !== -1
    },
    systemDetails() {
      return this.faction.faction_presence?.map((system) => {
        return this.systemDetailsTable(system, this.faction)
      })
    },
    datePickerDisplay() {
      return `${this.filterDates[0]} - ${this.filterDates[1]}`
    }
  },
  methods: {
    ...mapMutations(['setSelectedFaction']),
    onChangedFilterDates(value) {
      if (value) {
        if (moment(value[0], this.dateFormat).isAfter(moment(value[1], this.dateFormat))) {
          value.reverse()
        }
        this.filterDates = [...value]
      }
      this.fetchFactionWithHistoryById()
    },
    getConflictStakeMessage(stake) {
      if (stake) {
        return `${stake} is at stake`
      } else {
        return `Nothing is at stake`
      }
    },
    async checkRedirect() {
      if (this.factionId.toLowerCase().startsWith('eddbid-')) {
        let faction = await this.$store.dispatch('fetchFactionByEddbId', {
          eddbId: this.factionId.slice(7)
        })
        await this.$router.push({ name: 'faction-detail', params: { factionId: faction.docs[0]._id } })
      }
    },
    async fetchFactionWithHistoryById() {
      this.loading = true
      let factionsPaginated = await this.$store.dispatch('fetchFactionWithHistoryById', {
        id: this.factionId,
        timeMin: moment.utc(this.filterDates[0], this.dateFormat).toDate().getTime(),
        timeMax: (this.filterDates[1] === moment().format(this.dateFormat)
          ? moment()
          : moment(this.filterDates[1], this.dateFormat)
        )
          .toDate()
          .getTime()
      })
      this.setSelectedFaction(factionsPaginated.docs[0])
      this.conflicts = this.faction.faction_presence.reduce((acc, system) => {
        return acc.concat(system.conflicts)
      }, [])
      this.systemsPresence = this.faction.faction_presence.length
      this.systemsControlled = this.faction.faction_presence.reduce((count, system) => {
        if (system.controlling) {
          return count + 1
        } else {
          return count
        }
      }, 0)
      this.loading = false
    },
    monitor() {
      this.$store.dispatch('saveUserFactions', [this.faction._id])
    },
    stopMonitor() {
      this.$store.dispatch('deleteUserFaction', this.faction._id)
    }
  }
}
</script>

<style scoped></style>
