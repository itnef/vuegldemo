<script setup lang="ts">

import { ref, onMounted, VueElement, Component } from "vue";
import PacGame from './PacGame.vue'

defineProps<{ msg: string
 }>();

</script>

<template>
  <div class="container" id="canvasContainer">
    <PacGame ref=game
                  @setScore="setScore($event)"
                  @setOdometer="setOdometer($event)"
                  @setGameMessage="setGameMessage($event)" />
    <div id="overlayL">
      <div>Eat Apples and Plant Trees!<br/>
Use cursor keys or numpad. Press space to halt, 0 to restart
      </div>
    </div>
    <div id="overlayR">
      <div>Score: <span id="score">
        {{ score }}
        </span>
        </div>
      <div>Odometer: 
        <span id="odometer">{{ odometer.toFixed(2) }}</span>
      </div>
    </div>
    <div id="overlayM">
      <span id="centralMessage" class="centralMessage">
        {{ gameMessage }}
        </span>
    </div>
  </div>
</template>

<script lang="ts">

export default {
    data() {
        return {
          score: 0,
          odometer: 0.0,
          gameMessage: ""
        }
    },

    methods: {
      setScore(this:any, newvalue: number) {
        this.score = newvalue;
      },
      setOdometer(this:any, newvalue: number) {
        this.odometer = newvalue;
      },
      setGameMessage(this:any, newvalue: string) {
        this.gameMessage = newvalue;
      }
    },

    mounted() {
    }
}
</script>

<!-- https://www.w3.org/Style/Examples/007/center.en.html -->

<style scoped>
.container {
  outline: dashed 1px black;
  position: absolute;
  display: flex;
  justify-content: center;
  width: 100%;
  height: 100%;
  max-width: 768px;
  max-height: 768px;
  /* TODO adapt all text divs to this */
  align-items: center;
}
#centralMessage {
  font-size: 48px;
  color: white;
  text-shadow: 2px 2px 8px #ff0000;
}
#overlayL {
  position: absolute;
  left: 10px;
  top: 10px;
  color: white;
  text-align: left;
}
#overlayR {
  position: absolute;
  left: 512px;
  top: 10px;
  color: yellowgreen;
  text-align: left;
}
#overlayM {
  position: relative;
  /* center it on the canvas! */
  margin: auto auto;
  text-align: center;
  
}
</style>
