export function BlackFirForestBackdrop() {
  return (
    <div className="black-fir-backdrop" aria-hidden="true">
      <svg
        className="black-fir-backdrop__art"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 960 360"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <path
            d="M0 76 12 44l8 19 13-43 13 43 9-21 17 34H47v25H24V76Z"
            id="fir-distant"
          />
          <path
            d="M0 125 18 79h-9l25-52 8 19L58 0l17 48h-9l27 49H78l17 28H59v43H30v-43Z"
            id="fir-mid"
          />
          <path
            d="M0 184 25 123H11l34-66 8 20L77 9l24 69H90l35 72h-19l20 34H78v50H42v-50Z"
            id="fir-front"
          />
        </defs>

        <rect className="black-fir-backdrop__sky" height="360" width="960" />
        <path
          className="black-fir-backdrop__ridge"
          d="M0 163 72 126l57 15 78-61 83 65 74-38 59 31 82-69 67 58 63-24 72 39 79-58 76 54 70-17 79 45v91H0Z"
        />

        <g className="black-fir-backdrop__trees black-fir-backdrop__trees--far">
          <use href="#fir-distant" x="-14" y="126" />
          <use href="#fir-distant" x="49" y="116" />
          <use href="#fir-distant" x="114" y="137" />
          <use href="#fir-distant" x="180" y="108" />
          <use href="#fir-distant" x="248" y="128" />
          <use href="#fir-distant" x="316" y="104" />
          <use href="#fir-distant" x="386" y="131" />
          <use href="#fir-distant" x="454" y="111" />
          <use href="#fir-distant" x="523" y="132" />
          <use href="#fir-distant" x="589" y="102" />
          <use href="#fir-distant" x="656" y="126" />
          <use href="#fir-distant" x="724" y="111" />
          <use href="#fir-distant" x="792" y="132" />
          <use href="#fir-distant" x="858" y="106" />
          <use href="#fir-distant" x="923" y="129" />
        </g>

        <g className="black-fir-backdrop__trees black-fir-backdrop__trees--mid">
          <use href="#fir-mid" x="-31" y="114" />
          <use href="#fir-mid" x="86" y="125" />
          <use href="#fir-mid" x="212" y="101" />
          <use href="#fir-mid" x="342" y="121" />
          <use href="#fir-mid" x="475" y="106" />
          <use href="#fir-mid" x="610" y="120" />
          <use href="#fir-mid" x="745" y="99" />
          <use href="#fir-mid" x="877" y="117" />
        </g>

        <g className="black-fir-backdrop__fog black-fir-backdrop__fog--rear">
          <path d="M-110 178c132-37 242 31 369 4s220-39 347-5 231-2 366-28v57c-125 29-238 24-365 5s-229-6-355 11-237 3-362-6Z" />
        </g>

        <path
          className="black-fir-backdrop__ground"
          d="M0 257c108-19 209 10 323-4 104-13 187-29 302-6 113 22 220-2 335-14v127H0Z"
        />

        <g className="black-fir-backdrop__trees black-fir-backdrop__trees--front">
          <use href="#fir-front" x="-50" y="142" />
          <use href="#fir-front" x="124" y="163" />
          <use href="#fir-front" x="710" y="159" />
          <use href="#fir-front" x="878" y="132" />
        </g>

        <g className="black-fir-backdrop__fog black-fir-backdrop__fog--front">
          <path d="M-126 260c145-35 274 27 418-2 138-27 251-26 389 0 135 26 244-13 393-31v64c-151 17-269 35-405 17-141-19-254-18-395 5-143 24-261-7-400 7Z" />
        </g>
        <g className="black-fir-backdrop__fog black-fir-backdrop__fog--low">
          <path d="M-95 306c122-18 236 13 359-3 131-17 250-15 378 4 133 19 255-8 392-13v66H-95Z" />
        </g>

        <g className="black-fir-backdrop__lights">
          <circle cx="165" cy="192" r="2.2" />
          <circle cx="286" cy="224" r="1.7" />
          <circle cx="409" cy="176" r="2" />
          <circle cx="554" cy="211" r="1.8" />
          <circle cx="681" cy="181" r="2.1" />
          <circle cx="817" cy="219" r="1.6" />
        </g>
      </svg>
      <span className="black-fir-backdrop__vignette" />
    </div>
  )
}
