<template>
  <div>
    <h1>Systems</h1>
    <v-form>
      <h4>Filter System</h4>
      <v-row>
        <v-col cols="12" sm="6">
          <v-text-field v-model="systemName" hint="Qa'wakana" label="System Name"></v-text-field>
        </v-col>
      </v-row>
    </v-form>
    <v-data-table
      class="elevation-1"
      :headers="headers"
      :items="systems"
      :page.sync="page"
      :server-items-length="totalSystems"
      :items-per-page="10"
      :footer-props="tableFooter"
      :loading="loading"
    >
      <template v-slot:[`item.name`]="{ item }">
        <router-link :to="{ name: 'system-detail', params: { systemId: item._id } }">{{ item.name }}</router-link>
      </template>
    </v-data-table>
  </div>
</template>

<script>
import { mapGetters, mapMutations } from 'vuex'
import { debounceTime, switchMap } from 'rxjs/operators'
import systemMethods from '@/mixins/systemMethods'

export default {
  name: 'SystemList',
  mixins: [systemMethods],
  // Todo: See issue https://github.com/vuetifyjs/vuetify/issues/13378
  // metaInfo: {
  //   title: 'System Search - Elite BGS'
  // },
  data() {
    return {
      systemName: '',
      headers: [
        {
          text: 'System Name',
          value: 'name'
        },
        {
          text: 'System Government',
          value: 'government'
        },
        {
          text: 'Allegiance',
          value: 'allegiance'
        },
        {
          text: 'Primary Economy',
          value: 'primary_economy'
        },
        {
          text: 'Secondary Economy',
          value: 'secondary_economy'
        },
        {
          text: 'State',
          value: 'state'
        }
      ],
      tableFooter: {
        disableItemsPerPage: true,
        showFirstLastPage: true,
        showCurrentPage: true
      },
      page: 1,
      totalSystems: 0,
      loading: false
    }
  },
  created() {
    this.fetchSystems()
    this.$watchAsObservable('systemName')
      .pipe(debounceTime(300))
      .pipe(
        switchMap((value) => {
          this.loading = true
          return this.fetchSystemsCall(this.page, value.newValue)
        })
      )
      .subscribe((systemsPaginated) => {
        this.setSystems(systemsPaginated.docs)
        this.totalSystems = systemsPaginated.total
        this.loading = false
      })
  },
  computed: {
    ...mapGetters({
      systems: 'friendlySystems'
    })
  },
  watch: {
    page() {
      this.fetchSystems()
    }
  },
  methods: {
    ...mapMutations(['setSystems']),
    async fetchSystems() {
      this.loading = true
      let systemsPaginated = await this.fetchSystemsCall(this.page, this.systemName)
      this.setSystems(systemsPaginated.docs)
      this.totalSystems = systemsPaginated.total
      this.loading = false
    }
  }
}
</script>

<style scoped></style>
