export default {
  methods: {
    fetchFactionsCall(page, factionName) {
      return this.$store.dispatch('fetchFactions', {
        page: page,
        beginsWith: factionName.trim()
      })
    }
  }
}
